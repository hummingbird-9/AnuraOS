/* global workbox, $scramjetController */

importScripts("/AnuraOS/browser/controller.sw.js");

// Route the browser's own proxy namespace explicitly. The previous dynamic
// shouldRoute-only matcher let requests fall through to GitHub Pages when the
// Scramjet controller had not registered its per-tab prefix yet; Pages then
// returned an unframeable error page ("host refused to connect").
const SCRAMJET_BASE_PATH = "/AnuraOS/browser/~/sj/";
const methods = ["GET", "POST", "HEAD", "PUT", "DELETE", "OPTIONS", "PATCH"];
for (const method of methods) {
	workbox.routing.registerRoute(
		({ url }) =>
			url.origin === self.location.origin &&
			url.pathname.startsWith(SCRAMJET_BASE_PATH),
		async ({ event, url }) => {
			console.warn("[Anura proxy] intercepted", event.request.method, url.href);
			try {
				if (!$scramjetController.shouldRoute(event)) {
					console.error("[Anura proxy] no Scramjet controller is registered for", url.href);
					return new Response(
						"Anura Browser proxy is not initialized for this tab. Reload AnuraOS and try again.\nURL: " + url.href,
						{ status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
					);
				}
				const response = await $scramjetController.route(event);
				if (response instanceof Response) {
					console.warn("[Anura proxy] returned", response.status, url.href);
					return response;
				}
				console.error("[Anura proxy] Scramjet returned no Response for", url.href);
				return new Response("Browser proxy returned an empty response.", { status: 502 });
			} catch (error) {
				console.error("[Anura proxy] request failed:", url.href, error);
				return new Response(
					"Browser proxy request failed: " + String(error) + "\nURL: " + url.href,
					{ status: 502, headers: { "content-type": "text/plain; charset=utf-8" } },
				);
			}
		},
		method,
	);
}
