/* global workbox, $scramjetController */

importScripts("/AnuraOS/browser/controller.sw.js");

const methods = ["GET", "POST", "HEAD", "PUT", "DELETE", "OPTIONS", "PATCH"];
for (const method of methods) {
	workbox.routing.registerRoute(
		({ event }) => {
			const matched = $scramjetController.shouldRoute(event);
			if (matched) {
				console.debug("[Anura proxy] intercepting", event.request.method, event.request.url);
			}
			return matched;
		},
		async ({ event }) => {
			try {
				const response = await $scramjetController.route(event);
				if (response instanceof Response) {
					console.debug("[Anura proxy] response", response.status, event.request.url);
					return response;
				}
				console.error("[Anura proxy] Scramjet returned no Response for", event.request.url);
				return new Response("Browser proxy returned an empty response.", { status: 502 });
			} catch (error) {
				console.error("[Anura proxy] request failed:", event.request.url, error);
				return new Response("Browser proxy request failed: " + String(error), { status: 502 });
			}
		},
		method,
	);
}
