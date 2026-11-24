import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = resolve(root, process.env.ANURA_STATIC_DIR || 'upstream/static');
const output = resolve(root, '_site');
const repository = process.env.GITHUB_REPOSITORY || 'hummingbird-9/AnuraOS';
const repositoryName = repository.split('/')[1] || 'AnuraOS';
const isUserSite = repositoryName.toLowerCase().endsWith('.github.io');

let basePath = process.env.PAGES_BASE_PATH || (isUserSite ? '/' : `/${repositoryName}/`);
if (!basePath.startsWith('/')) basePath = `/${basePath}`;
if (!basePath.endsWith('/')) basePath += '/';

// Fail instead of publishing an incomplete static build, especially one that
// accidentally omits the built-in terminal or its hterm runtime.
const requiredFiles = [
  'index.html',
  'anura-sw.js',
  'browser/index.html',
  'apps/ashell.app/term.html',
  'apps/ashell.app/term.js',
];
for (const file of requiredFiles) {
  try {
    await readFile(resolve(source, file));
  } catch {
    throw new Error(`Incomplete AnuraOS static build: missing ${file} in ${source}. Run make static first.`);
  }
}

const htermVersionsPath = resolve(source, 'apps/libhterm.lib/versions');
const htermVersions = await readdir(htermVersionsPath, { withFileTypes: true }).catch(() => []);
let hasHtermRuntime = false;
for (const version of htermVersions) {
  if (!version.isDirectory()) continue;
  try {
    await readFile(resolve(htermVersionsPath, version.name, 'index.js'));
    hasHtermRuntime = true;
    break;
  } catch {
    // Check the next installed hterm version.
  }
}
if (!hasHtermRuntime) {
  throw new Error('Incomplete AnuraOS static build: the libhterm runtime is missing.');
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

// Prefix only Anura's known root-level asset paths. This keeps remote URLs and
// URLs belonging to proxied websites untouched.
const rootEntries = [
  'anura-sw\\.js',
  'COMMIT',
  'MILESTONE',
  'apps',
  'artifacts',
  'assets',
  'bin',
  'bios',
  'bootstrap',
  'browser',
  'bundle\\.css',
  'cache-load\\.json',
  'config\\.json',
  'favicon\\.ico',
  'fs',
  'icon(?:_dark)?\\.png',
  'lib',
  'libs',
  'manifest\\.json',
  'mw_icon(?:_colored)?\\.png',
  'pwa_icon\\.png',
  'sw',
  'theme\\.css',
  'x86images',
].join('|');
const rootPathPattern = new RegExp(
  "(?<=[\\\\\"'`=(:,])/(?:"
    + rootEntries
    + ")(?=$|[/?#.'\"\\\\s)])",
  'g',
);
const textExtensions = new Set([
  '.css', '.html', '.htm', '.js', '.json', '.mjs', '.cjs',
  '.svg', '.txt', '.webmanifest', '.xml',
]);

async function walk(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(path));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

let rewrittenFiles = 0;
if (basePath !== '/') {
  for (const file of await walk(output)) {
    if (!textExtensions.has(extname(file).toLowerCase())) continue;
    const original = await readFile(file, 'utf8');
    let rewritten = original;
    const protectedPaths = [
      ['"/apps/libfileview.app/fileHandler.js"', '"__ANURA_INTERNAL_FILEHANDLER_PATH__"'],
      ["'/apps/libfileview.app/fileHandler.js'", "'__ANURA_INTERNAL_FILEHANDLER_PATH__'"],
    ];
    for (const [path, sentinel] of protectedPaths) {
      rewritten = rewritten.replaceAll(path, sentinel);
    }
    rewritten = rewritten.replace(
      rootPathPattern,
      (match) => `${basePath}${match.slice(1)}`,
    );
    for (const [path, sentinel] of protectedPaths) {
      rewritten = rewritten.replaceAll(sentinel, path);
    }
    if (rewritten !== original) {
      await writeFile(file, rewritten);
      rewrittenFiles++;
    }
  }
}

// Use the repository base URL for any relative resources loaded by index.html.
const indexPath = resolve(output, 'index.html');
let index = await readFile(indexPath, 'utf8');
const baseTag = `<base href="${basePath}">`;
if (/<base\b/i.test(index)) {
  index = index.replace(/<base\b[^>]*>/i, baseTag);
} else {
  index = index.replace(/<head\b[^>]*>/i, (head) => `${head}\n\t\t${baseTag}`);
}
await writeFile(indexPath, index);

const notFound = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening AnuraOS…</title></head>
<body><script>
  const base = ${JSON.stringify(basePath)};
  const requested = new URL(location.href);
  location.replace(base + requested.search + requested.hash);
</script><noscript>Open <a href="${basePath}">AnuraOS</a>.</noscript></body></html>
`;
await writeFile(resolve(output, '404.html'), notFound);
await writeFile(resolve(output, '.nojekyll'), '');

console.log(`Staged AnuraOS at ${output} with base path ${basePath}; rewrote ${rewrittenFiles} text assets.`);
