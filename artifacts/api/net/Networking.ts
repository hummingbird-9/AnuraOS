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
	private libcurlReady: Promise<void>;
	private resolveLibcurlReady!: () => void;
	private rejectLibcurlReady!: (reason: Error) => void;
	private libcurlSettled = false;
	private libcurlTimeout: number | undefined;
	private wispConnected = false;
	private wispWaiters: Array<() => void> = [];

		constructor(wisp_server: string) {
		this.wispServer = wisp_server;
		this.libcurlReady = new Promise<void>((resolve, reject) => {
			this.resolveLibcurlReady = resolve;
			this.rejectLibcurlReady = reject;
		});
		void this.libcurlReady.catch(() => {});
		this.libcurlTimeout = window.setTimeout(() => this.failLibcurl(new Error("Timed out initializing libcurl. External browser requests cannot be proxied.")), 30000);

		const upstream = new WebSocket(wisp_server);
		this.upstream = upstream;
		this.bus = new WispBus(upstream);
		this.watchUpstream(upstream);

		document.addEventListener("libcurl_load", () => {
			if (this.libcurlSettled) return;
			try {
				this.libcurl.set_websocket(wisp_server);
				this.external.fetch = this.libcurl.fetch;
				Object.assign(this, {
					WebSocket: this.libcurl.WebSocket,
					Socket: this.libcurl.WispConnection,
					TLSSocket: this.libcurl.TLSSocket,
				});
				this.libcurlSettled = true;
				if (this.libcurlTimeout !== undefined) {
					window.clearTimeout(this.libcurlTimeout);
					this.libcurlTimeout = undefined;
				}
				console.info("Anura libcurl/Wisp transport initialized.");
				this.resolveLibcurlReady();
			} catch (error) {
				this.failLibcurl(error);
			}
		}, { once: true });
		document.addEventListener("libcurl_abort", (event: Event) => this.failLibcurl((event as CustomEvent).detail), { once: true });

		//@ts-ignore
		import(this.libcurl_src).then(async (m) => {
			this.libcurl = m.libcurl;
			// Install Wisp bus before libcurl creates its HTTP session.
			this.libcurl.transport = this.bus.getFakeWSProxySocket();
			await this.libcurl.load_wasm(this.libcurl_wasm);
		}).catch((error) => this.failLibcurl(error));
	}

	private failLibcurl(reason: unknown) {
		if (this.libcurlSettled) return;
		this.libcurlSettled = true;
		if (this.libcurlTimeout !== undefined) {
			window.clearTimeout(this.libcurlTimeout);
			this.libcurlTimeout = undefined;
		}
		const error = reason instanceof Error ? reason : new Error(String(reason ?? "Unknown libcurl error"));
		console.error("Anura libcurl initialization failed:", error);
		this.rejectLibcurlReady(error);
	}

	private markWispReady() {
		if (this.wispConnected) return;
		this.wispConnected = true;
		for (const resolve of this.wispWaiters.splice(0)) resolve();
	}

	private markWispDisconnected() {
		this.wispConnected = false;
	}

	private waitForWisp(timeoutMs = 30000): Promise<void> {
		if (this.wispConnected) return Promise.resolve();
		return new Promise<void>((resolve, reject) => {
			let timer: number;
			const finish = () => {
				window.clearTimeout(timer);
				const index = this.wispWaiters.indexOf(finish);
				if (index !== -1) this.wispWaiters.splice(index, 1);
				resolve();
			};
			timer = window.setTimeout(() => {
				const index = this.wispWaiters.indexOf(finish);
				if (index !== -1) this.wispWaiters.splice(index, 1);
				reject(new Error("Timed out waiting for the Wisp proxy connection."));
			}, timeoutMs);
			this.wispWaiters.push(finish);
		});
	}

	get ready(): Promise<void> {
		return this.libcurlReady.then(() => this.waitForWisp());
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
			this.markWispReady();
		});
		socket.addEventListener("close", () => {
			if (handshakeTimer !== undefined) window.clearTimeout(handshakeTimer);
			if (this.upstream === socket) {
				this.markWispDisconnected();
				this.scheduleReconnect();
			}
		});
		socket.addEventListener("error", () => {
			if (this.upstream === socket && socket.readyState === WebSocket.CLOSED) {
				this.markWispDisconnected();
				this.scheduleReconnect();
			}
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
			this.markWispReady();
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
		// Avoid CORS-limited window.fetch before the libcurl proxy is ready.
		await this.ready;
		return this.external.fetch(input, init);
	};
}
