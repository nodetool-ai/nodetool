 .PHONY: help install install-web install-electron install-mobile install-chrome-extension build test test-web test-electron test-mobile test-chrome-extension test-watch test-coverage test-coverage-web test-coverage-electron test-coverage-mobile lint lint-web lint-electron lint-chrome-extension lint-mobile typecheck typecheck-web typecheck-electron typecheck-chrome-extension typecheck-mobile clean clean-build check all format quickstart build-chrome-extension

# Default target
help:
	@echo "NodeTool Build Commands"
	@echo "======================="
	@echo ""
	@echo "Setup & Installation:"
	@echo "  make install          - Install all dependencies (web, electron, mobile, chrome-extension)"
	@echo "  make install-web      - Install web dependencies"
	@echo "  make install-electron - Install electron dependencies"
	@echo "  make install-mobile   - Install mobile dependencies"
	@echo "  make install-chrome-extension - Install chrome extension dependencies"
	@echo ""
	@echo "Development:"
	@echo "  make electron         - Build web and start electron app"
	@echo ""
	@echo "Build:"
	@echo "  make build            - Build all packages"
	@echo "  make build-web        - Build web package"
	@echo "  make build-electron   - Build electron package"
	@echo "  make build-chrome-extension - Build chrome extension"
	@echo ""
	@echo "Testing:"
	@echo "  make test             - Run all tests"
	@echo "  make test-web         - Run web tests"
	@echo "  make test-electron    - Run electron tests"
	@echo "  make test-mobile      - Run mobile tests"
	@echo "  make test-chrome-extension - Run chrome extension tests"
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
	@echo "  make typecheck-chrome-extension - Type check chrome extension"
	@echo "  make check            - Run all checks (typecheck, lint, test)"
	@echo "  make format           - Format code (alias for lint-fix)"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean            - Remove build artifacts and dependencies"
	@echo "  make clean-build      - Remove build artifacts only"
	@echo ""
	@echo "Combined:"
	@echo "  make all              - Install, typecheck, lint, test, and build"

# Installation targets
install: install-web install-electron install-mobile install-chrome-extension

install-web:
	@echo "Installing web dependencies..."
	cd web && npm install

install-electron:
	@echo "Installing electron dependencies..."
	cd electron && npm install

install-mobile:
	@echo "Installing mobile dependencies..."
	cd mobile && npm install

install-chrome-extension:
	@echo "Installing chrome extension dependencies..."
	cd chrome-extension && npm install

# Web build optimization
WEB_DIR := web
WEB_BUILD_MARKER := $(WEB_DIR)/dist/.build_marker
WEB_SOURCES := $(shell find $(WEB_DIR)/src -type f 2>/dev/null) $(WEB_DIR)/package.json $(WEB_DIR)/vite.config.ts $(WEB_DIR)/index.html

$(WEB_BUILD_MARKER): $(WEB_SOURCES)
	@echo "Building web package (sources changed)..."
	cd web && npm run build
	@touch $(WEB_BUILD_MARKER)

electron: $(WEB_BUILD_MARKER)
	@echo "Building electron vite..."
	cd electron && npm run vite:build
	@echo "Starting electron app..."
	cd electron && npm start

# Build targets
build: build-web build-electron build-chrome-extension

build-web: $(WEB_BUILD_MARKER)

build-electron:
	@echo "Building electron package..."
	cd electron && npm run build

build-chrome-extension:
	@echo "Building chrome extension..."
	cd chrome-extension && npm run build

# Test targets
test: test-web test-electron test-mobile test-chrome-extension

test-web:
	@echo "Running web tests..."
	cd web && npm test

test-electron:
	@echo "Running electron tests..."
	cd electron && npm test

test-mobile:
	@echo "Running mobile tests..."
	cd mobile && npm test

test-chrome-extension:
	@echo "Running chrome extension tests..."
	cd chrome-extension && npm test || true

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
lint: lint-web lint-electron lint-chrome-extension

lint-web:
	@echo "Linting web package..."
	cd web && npm run lint

lint-electron:
	@echo "Linting electron package..."
	cd electron && npm run lint

lint-chrome-extension:
	@echo "Linting chrome extension..."
	cd chrome-extension && npm run lint

lint-fix: lint-fix-web lint-fix-electron lint-fix-chrome-extension

lint-fix-web:
	@echo "Fixing web linting issues..."
	cd web && npm run lint:fix

lint-fix-electron:
	@echo "Fixing electron linting issues..."
	cd electron && npm run lint:fix

lint-fix-chrome-extension:
	@echo "Fixing chrome extension linting issues..."
	cd chrome-extension && npm run lint:fix

format: lint-fix

# Type checking targets
typecheck: typecheck-web typecheck-electron typecheck-mobile typecheck-chrome-extension

typecheck-web:
	@echo "Type checking web package..."
	cd web && npm run typecheck

typecheck-electron:
	@echo "Type checking electron package..."
	cd electron && npm run typecheck

typecheck-mobile:
	@echo "Type checking mobile package..."
	@cd mobile && npx tsc --noEmit

typecheck-chrome-extension:
	@echo "Type checking chrome extension..."
	cd chrome-extension && npm run typecheck

# Check target (run all checks)
check: typecheck lint test

# Clean targets
clean: clean-build
	@echo "Removing all dependencies..."
	rm -rf web/node_modules
	rm -rf electron/node_modules
	rm -rf mobile/node_modules
	rm -rf chrome-extension/node_modules
	rm -rf node_modules

clean-build:
	@echo "Removing build artifacts..."
	rm -rf web/build
	rm -rf web/dist
	rm -rf electron/dist
	rm -rf electron/dist-electron
	rm -rf chrome-extension/dist

# Combined target
all: install typecheck lint test build
	@echo "All tasks completed successfully!"

# Quick start target for new developers
quickstart: install
	@echo ""
	@echo "Installation complete! Next steps:"
	@echo "  make dev-web       - Start web development server"
	@echo "  make dev-electron  - Build web and start electron app"
	@echo ""
	@echo "Or run 'make dev' to start all servers"
