UPSTREAM_DIR ?= upstream

.PHONY: all static pages clean

all:
	$(MAKE) -C "$(UPSTREAM_DIR)" all

static:
	rm -rf "$(UPSTREAM_DIR)/static"
	$(MAKE) -C "$(UPSTREAM_DIR)" static

pages: static
	npm run build:pages

clean:
	$(MAKE) -C "$(UPSTREAM_DIR)" clean
	rm -rf "$(UPSTREAM_DIR)/static" _site
