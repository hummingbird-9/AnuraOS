UPSTREAM_DIR ?= upstream

# Rust tools installed by rustup/cargo live here on Arch and GitHub runners.
export PATH := $(HOME)/.cargo/bin:$(PATH)

.PHONY: all static pages clean prepare

# The upstream bootstrap tries to write .git/hooks directly. In this wrapper
# upstream is a submodule, whose .git entry is a pointer file, so omit that
# optional local-only pre-commit hook setup when producing the static build.
prepare:
	@sed -i '/^[[:space:]]*make hooks[[:space:]]*$/d' "$(UPSTREAM_DIR)/Makefile"
	@sed -i 's/\.files\[\] | "/.files[] | select(.source != null and .icon != null) | "/' "$(UPSTREAM_DIR)/apps/libfileview.lib/geticons.sh"

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
