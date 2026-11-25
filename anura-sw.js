/* global workbox */

// was a workaround for a firefox quirk where crossOriginIsolated
// is not reported properly in a service worker, now its just assumed for
// compatibility with UV
Object.defineProperty(globalThis, "crossOriginIsolated", {
	value: true,
	writable: false,
});

// Importing mime
importScripts("/AnuraOS/libs/mime/mime.iife.js");
importScripts("/AnuraOS/libs/idb-keyval/idb-keyval.js");
importScripts("/AnuraOS/libs/comlink/comlink.min.umd.js");
importScripts("/AnuraOS/libs/workbox/workbox-v7.4.0/workbox-sw.js");

workbox.setConfig({
	debug: false,
	modulePathPrefix: "/AnuraOS/libs/workbox/workbox-v7.4.0",
});

workbox.core.skipWaiting();
workbox.core.clientsClaim();

importScripts("/AnuraOS/sw/consts.js", "/AnuraOS/sw/messages.js", "/AnuraOS/sw/fs.js");
importScripts(
	"/AnuraOS/sw/routes/fs.js",
	"/AnuraOS/sw/routes/display.js",
	"/AnuraOS/sw/routes/dav.js",
	"/AnuraOS/sw/routes/filepicker.js",
	"/AnuraOS/sw/routes/proxy.js",
	"/AnuraOS/sw/routes/main.js",
);

(async () => {
	for (const client of await self.clients.matchAll()) {
		client.postMessage({
			anura_target: "anura.sw.reinit",
		});
	}
})();
