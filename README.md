# AnuraOS static deployment

This repository deploys a clean, pinned checkout of the official
[MercuryWorkshop/anuraOS](https://github.com/MercuryWorkshop/anuraOS) source.

The upstream repository is pinned as the `upstream` submodule. Its own
Makefile is used for the actual build; this repository only stages the result
for GitHub Pages, following the same build-pages pattern as HummingEngine.

## Build locally

Clone with all submodules:

```sh
git clone --recurse-submodules https://github.com/hummingbird-9/AnuraOS
cd AnuraOS
make static
npm run build:pages
```

Or run both steps with:

```sh
make pages
```

The upstream build output is `upstream/static/`. The Pages-ready output is
`_site/`. The staging script applies the `/AnuraOS/` project-site base path
without modifying upstream source files, checks that the built-in terminal
and hterm runtime are present, and creates a Pages-compatible `404.html`.

## Clean rebuild

```sh
make clean
make pages
```

The static build does not run `make rootfs` or `make rootfs-alpine`; Docker
is not needed for this Pages build.
