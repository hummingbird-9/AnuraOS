/* global workbox, $scramjetController */

importScripts("/AnuraOS/browser/controller.sw.js");

const methods = ["GET", "POST", "HEAD", "PUT", "DELETE", "OPTIONS", "PATCH"];
for (const method of methods) {
	workbox.routing.registerRoute(
		({ event }) => $scramjetController.shouldRoute(event),
		async ({ event }) => {
			try {
				const response = await $scramjetController.route(event);
				if (response instanceof Response) return response;
				console.error("Scramjet returned no Response for", event.request.url);
				return new Response("Browser proxy returned an empty response.", { status: 502 });
			} catch (error) {
				console.error("Browser proxy request failed:", event.request.url, error);
				return new Response("Browser proxy request failed: " + String(error), { status: 502 });
			}
		},
		method,
	);
}
