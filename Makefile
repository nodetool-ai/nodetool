.PHONY: help install install-web install-electron install-mobile build test test-web test-electron test-mobile test-watch test-coverage test-coverage-web test-coverage-electron test-coverage-mobile lint lint-web lint-electron lint-mobile typecheck typecheck-web typecheck-electron typecheck-mobile clean clean-build check all format quickstart check-node-version electron-dev dev dev-server build-stale-backend screenshots screenshots-force

# Default target
help:
	@echo "NodeTool Build Commands"
	@echo "======================="
	@echo ""
	@echo "Setup & Installation:"
	@echo "  make install          - Install all dependencies (web, electron, mobile)"
	@echo "  make install-web      - Install web dependencies"
	@echo "  make install-electron - Install electron dependencies"
	@echo "  make install-mobile   - Install mobile dependencies"
	@echo ""
	@echo "Development:"
	@echo "  make electron         - Build web and start electron app"
	@echo "  make electron-dev     - Start Electron against web Vite server (requires active conda env)"
	@echo "  make dev              - Start backend (tsx --watch) + web Vite server (auto-reload)"
	@echo "  make dev-server       - Start backend dev server only (tsx --watch, no build needed)"
	@echo ""
	@echo "Build:"
	@echo "  make build            - Build all packages"
	@echo "  make build-web        - Build web package"
	@echo "  make build-electron   - Build electron package"
	@echo ""
	@echo "Testing:"
	@echo "  make test             - Run all tests"
	@echo "  make test-web         - Run web tests"
	@echo "  make test-electron    - Run electron tests"
	@echo "  make test-mobile      - Run mobile tests"
	@echo "  make test-watch       - Run tests in watch mode"
	@echo "  make test-coverage    - Run tests with coverage"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint             - Lint all packages"
	@echo "  make lint-fix         - Fix linting issues"
	@echo "  make typecheck        - Type check all packages"
	@echo "  make typecheck-web    - Type check web package"
	@echo "  make typecheck-electron - Type check electron package"
	@echo "  make typecheck-mobile - Type check mobile package"
	@echo "  make check            - Run all checks (typecheck, lint, test)"
	@echo "  make format           - Format code (alias for lint-fix)"
	@echo ""
	@echo "Documentation Screenshots:"
	@echo "  make screenshots                 - Capture real screenshots (auto-starts web dev server)"
	@echo "  make screenshots-force           - Re-capture ALL screenshots (overwrite existing)"
	@echo "    API calls are intercepted with mock data — no real backend needed."
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean            - Remove build artifacts and dependencies"
	@echo "  make clean-build      - Remove build artifacts only"
	@echo ""
	@echo "Combined:"
	@echo "  make all              - Install, typecheck, lint, test, and build"

# Installation targets
install: install-web install-electron install-mobile

install-web:
	@echo "Installing web dependencies..."
	cd web && npm install

install-electron:
	@echo "Installing electron dependencies..."
	cd electron && npm install

install-mobile:
	@echo "Installing mobile dependencies..."
	cd mobile && npm install

# Web build optimization
WEB_DIR := web
WEB_BUILD_MARKER := $(WEB_DIR)/dist/.build_marker
WEB_SOURCES := $(shell find $(WEB_DIR)/src -type f 2>/dev/null) $(WEB_DIR)/package.json $(WEB_DIR)/vite.config.ts $(WEB_DIR)/index.html

$(WEB_BUILD_MARKER): $(WEB_SOURCES)
	@echo "Building web package (sources changed)..."
	cd web && npm run build
	@touch $(WEB_BUILD_MARKER)

# Electron build optimization
ELECTRON_DIR := electron
ELECTRON_BUILD_MARKER := $(ELECTRON_DIR)/dist-electron/.build_marker
ELECTRON_SOURCES := $(shell find $(ELECTRON_DIR)/src -type f 2>/dev/null) \
	$(shell find $(ELECTRON_DIR)/pages -type f 2>/dev/null) \
	$(shell find $(ELECTRON_DIR)/assets -type f 2>/dev/null) \
	$(ELECTRON_DIR)/package.json \
	$(ELECTRON_DIR)/package-lock.json \
	$(ELECTRON_DIR)/vite.config.ts \
	$(ELECTRON_DIR)/tsconfig.json \
	$(ELECTRON_DIR)/index.html

$(ELECTRON_BUILD_MARKER): $(ELECTRON_SOURCES)
	@echo "Building Electron main/preload bundle..."
	cd electron && npm run vite:build
	@touch $(ELECTRON_BUILD_MARKER)

electron: $(WEB_BUILD_MARKER) $(ELECTRON_BUILD_MARKER)
	@echo "Starting electron app..."
	cd electron && npm start

# tsx --watch dev server: runs TS source directly, restarts on changes.
# NOTE: electron-dev runs the compiled websocket backend. Rebuild any stale
# backend workspaces before launch so dist-backed packages stay in sync.
dev:
	npm run dev:watch

dev-server:
	npm run dev:watch:server

build-stale-backend:
	@echo "Building stale backend workspaces..."
	npm run build:stale --workspace=packages/websocket

check-node-version:
	@NODE_MAJOR=$$(node -e "console.log(process.versions.node.split('.')[0])"); \
	if [ "$$NODE_MAJOR" != "22" ]; then \
		echo "ERROR: Node.js 22.x required (found $$(node -v))"; \
		echo "  Electron 35 embeds Node 22 — native modules must match."; \
		echo "  Run: nvm use 22"; \
		exit 1; \
	fi

ifeq ($(OS),Windows_NT)
electron-dev: check-node-version build-stale-backend
	@echo "Rebuilding native modules for Electron..."
	cd electron && npx electron-builder install-app-deps
	@echo "Starting Electron development mode..."
	powershell -ExecutionPolicy Bypass -File scripts/electron-dev.ps1
else
electron-dev: check-node-version build-stale-backend
	@echo "Rebuilding native modules for Electron..."
	cd electron && npx electron-builder install-app-deps
	@echo "Starting Electron development mode..."
	./scripts/electron-dev.sh
endif

# Build targets
build: build-web build-electron

build-web: $(WEB_BUILD_MARKER)

build-electron:
	@echo "Building electron package..."
	cd electron && npm run build

# Test targets
test: test-web test-electron test-mobile

test-web:
	@echo "Running web tests..."
	cd web && npm test

test-electron:
	@echo "Running electron tests..."
	cd electron && npm test

test-mobile:
	@echo "Running mobile tests..."
	cd mobile && npm test

test-watch:
	@echo "Running tests in watch mode (web)..."
	cd web && npm run test:watch

test-coverage:
	@echo "Running tests with coverage..."
	@$(MAKE) -j3 test-coverage-web test-coverage-electron test-coverage-mobile

test-coverage-web:
	cd web && npm run test:coverage

test-coverage-electron:
	cd electron && npm run test:coverage

test-coverage-mobile:
	cd mobile && npm run test:coverage

# Linting targets
lint: lint-web lint-electron

lint-web:
	@echo "Linting web package..."
	cd web && npm run lint

lint-electron:
	@echo "Linting electron package..."
	cd electron && npm run lint

lint-fix: lint-fix-web lint-fix-electron

lint-fix-web:
	@echo "Fixing web linting issues..."
	cd web && npm run lint:fix

lint-fix-electron:
	@echo "Fixing electron linting issues..."
	cd electron && npm run lint:fix

format: lint-fix

# Type checking targets
typecheck: typecheck-web typecheck-electron typecheck-mobile

typecheck-web:
	@echo "Type checking web package..."
	cd web && npm run typecheck

typecheck-electron:
	@echo "Type checking electron package..."
	cd electron && npm run typecheck

typecheck-mobile:
	@echo "Building shared protocol package for mobile..."
	cd packages/protocol && npm run build
	@echo "Type checking mobile package..."
	cd mobile && npm run typecheck

# Check target (run all checks)
check: typecheck lint test

# Clean targets
clean: clean-build
	@echo "Removing all dependencies..."
	rm -rf web/node_modules
	rm -rf electron/node_modules
	rm -rf mobile/node_modules
	rm -rf node_modules

clean-build:
	@echo "Removing build artifacts..."
	rm -rf web/build
	rm -rf web/dist
	rm -rf electron/dist
	rm -rf electron/dist-electron

# Combined target
all: install typecheck lint test build
	@echo "All tasks completed successfully!"

# Documentation screenshot targets
screenshots:
	@echo "Capturing documentation screenshots (API calls intercepted with mock data)..."
	cd web && npm run screenshots

screenshots-force:
	@echo "Re-capturing ALL documentation screenshots (overwriting existing)..."
	cd web && npm run screenshots:force

# Quick start target for new developers
quickstart: install
	@echo ""
	@echo "Installation complete! Next steps:"
	@echo "  cd web && npm start    - Start web development server"
	@echo "  make electron          - Build web and start electron app"
	@echo ""
	@echo "For more commands, run 'make help'"
