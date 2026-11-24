class Networking {
	bus: WispBus;
	libcurl: any;
	libcurl_src = "/AnuraOS/libs/libcurl/libcurl.mjs";
	libcurl_wasm = "/AnuraOS/libs/libcurl/libcurl.wasm";
	external = {
		fetch: window.fetch, // Default until another thing is registered ig
	};
	WebSocket: typeof WebSocket;
	Socket: any;
	TLSSocket: any;
	private wispServer: string;
	private upstream: WebSocket;
	private reconnectTimer: number | undefined;
	private reconnectingSocket: WebSocket | undefined;
	private reconnectDelay = 1000;

	constructor(wisp_server: string) {
		this.wispServer = wisp_server;
		const upstream = new WebSocket(wisp_server);
		this.upstream = upstream;
		this.bus = new WispBus(upstream);
		this.watchUpstream(upstream);

		//@ts-ignore
		import(this.libcurl_src).then(async (m) => {
			this.libcurl = m.libcurl;
			this.libcurl.load_wasm(this.libcurl_wasm);
			this.libcurl.transport = this.bus.getFakeWSProxySocket();
		});
		document.addEventListener("libcurl_load", () => {
			this.libcurl.set_websocket(wisp_server);
			this.external.fetch = this.libcurl.fetch;

			Object.assign(this, {
				WebSocket: this.libcurl.WebSocket,
				Socket: this.libcurl.WispConnection,
				TLSSocket: this.libcurl.TLSSocket,
			});
			console.debug("libcurl.js ready!");
		});
	}
	private watchUpstream(socket: WebSocket, alreadyHandshaken = false) {
		let handshaken = alreadyHandshaken;
		let handshakeTimer: number | undefined;
		if (!handshaken) {
			handshakeTimer = window.setTimeout(() => {
				if (!handshaken && this.upstream === socket &&
					socket.readyState !== WebSocket.CLOSED &&
					socket.readyState !== WebSocket.CLOSING) {
					console.warn("Wisp upstream handshake timed out; reconnecting.");
					socket.close();
				}
			}, 10000);
		}
		socket.addEventListener("message", (event: MessageEvent) => {
			if (handshaken || !(event.data instanceof ArrayBuffer)) return;
			const bytes = new Uint8Array(event.data);
			if (bytes.byteLength < 9 || bytes[0] !== 3) return;
			const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			if (view.getUint32(1, true) !== 0) return;
			handshaken = true;
			if (handshakeTimer !== undefined) window.clearTimeout(handshakeTimer);
			this.bus.upstreamBuffer = view.getUint32(5, true);
		});
		socket.addEventListener("close", () => {
			if (handshakeTimer !== undefined) window.clearTimeout(handshakeTimer);
			if (this.upstream === socket) this.scheduleReconnect();
		});
		socket.addEventListener("error", () => {
			if (this.upstream === socket && socket.readyState === WebSocket.CLOSED) this.scheduleReconnect();
		});
	}
	private scheduleReconnect() {
		if (this.reconnectTimer !== undefined || this.reconnectingSocket) return;
		const delay = this.reconnectDelay;
		this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
		console.warn(`Wisp upstream disconnected; retrying in ${delay}ms.`);
		this.reconnectTimer = window.setTimeout(() => {
			this.reconnectTimer = undefined;
			this.reconnectUpstream();
		}, delay);
	}
	private reconnectUpstream() {
		if (this.upstream.readyState === WebSocket.OPEN || this.upstream.readyState === WebSocket.CONNECTING) return;
		let socket: WebSocket;
		try { socket = new WebSocket(this.wispServer); }
		catch (error) {
			console.warn("Unable to create Wisp reconnect socket.", error);
			this.scheduleReconnect();
			return;
		}
		socket.binaryType = "arraybuffer";
		this.reconnectingSocket = socket;
		let finished = false;
		let timeout: number;
		const cleanup = () => {
			window.clearTimeout(timeout);
			socket.removeEventListener("message", onMessage);
			socket.removeEventListener("error", retry);
			socket.removeEventListener("close", retry);
		};
		const retry = () => {
			if (finished) return;
			finished = true;
			cleanup();
			if (this.reconnectingSocket === socket) this.reconnectingSocket = undefined;
			if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close();
			this.scheduleReconnect();
		};
		const onMessage = (event: MessageEvent) => {
			if (!(event.data instanceof ArrayBuffer)) return;
			const bytes = new Uint8Array(event.data);
			if (bytes.byteLength < 9 || bytes[0] !== 3) return;
			const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			if (view.getUint32(1, true) !== 0) return;
			finished = true;
			cleanup();
			this.bus.upstreamBuffer = view.getUint32(5, true);
			this.bus.setUpstreamProvider(socket);
			this.upstream = socket;
			this.reconnectingSocket = undefined;
			this.reconnectDelay = 1000;
			this.watchUpstream(socket, true);
			console.info("Wisp upstream reconnected.");
		};
		timeout = window.setTimeout(retry, 10000);
		socket.addEventListener("message", onMessage);
		socket.addEventListener("error", retry);
		socket.addEventListener("close", retry);
	}

	loopback = {
		addressMap: new Map(),
		call: async (port: number, request: Request) => {
			return await this.loopback.addressMap.get(port)(request);
		},
		set: async (port: number, handler: () => Response) => {
			this.loopback.addressMap.set(port, handler);
		},
		deregister: async (port: number) => {
			this.loopback.addressMap.delete(port);
		},
	};
	fetch = async (input: RequestInfo | URL, init: RequestInit) => {
		const url = new URL(
			input instanceof Request ? input.url : input.toString(),
		);
		if (url.hostname === "localhost") {
			// we will assume if theres no port, its 80, god forbid it being 443
			const port = Number(url.port) || 80;
			let request: Request;
			if (typeof input === "string" || input instanceof URL) {
				request = new Request(input, init);
			} else if (input instanceof Request) {
				request = input;
			}

			if (this.loopback.addressMap.has(port)) {
				return this.loopback.call(port, request!);
			}
		}
		return this.external.fetch(input, init);
	};
}
