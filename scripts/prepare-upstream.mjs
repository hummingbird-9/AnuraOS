import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const upstream = resolve(process.argv[2] || 'upstream');
const upstreamMakefile = resolve(upstream, 'Makefile');
const iconsScript = resolve(upstream, 'apps/libfileview.lib/geticons.sh');

let makefile = await readFile(upstreamMakefile, 'utf8');
const hooksLine = /^[ \t]*make hooks[ \t]*\r?\n/gm;
if (hooksLine.test(makefile)) {
  makefile = makefile.replace(hooksLine, '');
  await writeFile(upstreamMakefile, makefile);
}

let icons = await readFile(iconsScript, 'utf8');
const originalQuery = String.raw`icon_paths=$(jq -r '.files[] | "\(.source) \(.icon)"' icons.json)`;
const filteredQuery = String.raw`icon_paths=$(jq -r '.files[] | select(.source != null and .icon != null) | "\(.source) \(.icon)"' icons.json)`;
if (icons.includes(originalQuery)) {
  icons = icons.replace(originalQuery, filteredQuery);
  await writeFile(iconsScript, icons);
} else if (!icons.includes(filteredQuery)) {
  throw new Error('Unrecognized upstream geticons.sh format; refusing to patch it blindly.');
}

console.log('Prepared upstream AnuraOS for a submodule static build.');
