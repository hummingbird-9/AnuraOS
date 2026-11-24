UPSTREAM_DIR ?= upstream

# Rust tools installed by rustup/cargo live here on Arch and GitHub runners.
export PATH := $(HOME)/.cargo/bin:$(PATH)

.PHONY: all static pages clean prepare

# Keep upstream's optional local Git hook out of its submodule build and skip
# Papirus icon mappings that have no source/destination (for example ".app").
prepare:
	node scripts/prepare-upstream.mjs "$(UPSTREAM_DIR)"

all: prepare
	$(MAKE) -C "$(UPSTREAM_DIR)" all

static: prepare
	rm -rf "$(UPSTREAM_DIR)/static"
	$(MAKE) -C "$(UPSTREAM_DIR)" static

pages: static
	npm run build:pages

clean:
	$(MAKE) -C "$(UPSTREAM_DIR)" clean
	rm -rf "$(UPSTREAM_DIR)/static" _site
