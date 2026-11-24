/* global workbox, bootStrapFSReady, idbKeyval, cacheenabled, opfs, filerfs, opfssh, filersh, serveFile, corsheaders */

workbox.routing.registerRoute(
	({ url }) =>
		url.origin === self.location.origin &&
		!/(\/config\.json|\/MILESTONE|\/COMMIT|\/x86images\/)/.test(url.pathname),
	async (event) => {
		await bootStrapFSReady;
		if (cacheenabled === undefined) {
			console.debug("retrieving cache value");
			cacheenabled = await idbKeyval.get("cacheenabled");
		}
		if (
			(!cacheenabled && event.url.pathname === "/" && !navigator.onLine) ||
			(!cacheenabled &&
				event.url.pathname === "/index.html" &&
				!navigator.onLine)
		) {
			return new Response(offlineError(), {
				status: 500,
				headers: { "content-type": "text/html" },
			});
		}
		if (!cacheenabled) {
			const fetchResponse = await fetch(event.request);
			return new Response(await fetchResponse.arrayBuffer(), {
				headers: {
					...Object.fromEntries(fetchResponse.headers.entries()),
					...corsheaders,
				},
			});
		}
		if (event.url.pathname === "/") event.url.pathname = "/index.html";
		if (event.url.password)
			return new Response(
				"<script>window.location.href = window.location.href</script>",
				{ headers: { "content-type": "text/html" } },
			);
		const basepath = "/anura_files";
		let path = decodeURI(event.url.pathname);

		// Force Filer to be used in cache routes, as it does not require waiting for anura to be connected
		const fs = opfs || filerfs;
		const sh = opfssh || filersh;

		const response = await serveFile(`${basepath}${path}`, fs, sh);

		if (response.ok) {
			return response;
		} else {
			try {
				const fetchResponse = await fetch(event.request);
			const responseBuffer = await fetchResponse.clone().arrayBuffer();
			const corsResponse = new Response(responseBuffer, {
				headers: {
					...Object.fromEntries(fetchResponse.headers.entries()),
					...corsheaders,
				},
			});

			// Cache in the background. A failed cache write must never make a
			// successful network response turn into an invalid service-worker response.
			if (fetchResponse.ok) {
				void (async () => {
					await sh.promises.mkdirp(`${basepath}${path.replace(/[^/]*$/g, "")}`);
					const buffer = await fetchResponse.clone().arrayBuffer();
					await fs.promises.writeFile(`${basepath}${path}`, Buffer.from(buffer));
				})().catch((error) => {
					console.warn("Unable to cache fetched resource:", path, error);
				});
			}
			return corsResponse;
			} catch (e) {
				return new Response(
					JSON.stringify({
						error: e.message,
						status: 500,
					}),
					{
						status: 500,
						headers: {
							"Content-Type": "application/json",
							...corsheaders,
						},
					},
				);
			}
		}
	},
);

// have to put this here because no cache
function offlineError() {
	return `<!DOCTYPE html>
            <html>
            <head>
            <style>
            body {
                font-family: "Roboto", RobotoDraft, "Droid Sans", Arial, Helvetica, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
                text-align: center;
                background: black;
                color: white;
                overflow: none;
                margin: 0;
            }
            #wrapper {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
            }
            </style>
            </head>
            <body>
            <div id="wrapper">
            <h1>AnuraOS is offline without offline support enabled.</h1>
            <p>If you have offline support enabled and you are seeing this, please refresh the page.</p>
            </div>
            </body>
            </html>
            `;
}
