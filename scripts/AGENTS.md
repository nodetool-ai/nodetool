# Build Scripts Guide

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **Scripts**

This guide helps AI agents understand the build and release scripts for NodeTool.

## Overview

The `scripts` directory contains build automation, release management, and deployment scripts for the NodeTool project.

## Script Files

Common scripts you might find:

### Build Scripts
- `build.sh` / `build.py` - Main build script
- `build-web.sh` - Build web UI
- `build-electron.sh` - Build Electron app
- `clean.sh` - Clean build artifacts

### Release Scripts
- `release.sh` - Create new release
- `package.sh` - Package application
- `publish.sh` - Publish to distribution channels

### Development Scripts
- `dev.sh` - Start development environment
- `watch.sh` - Watch for changes and rebuild
- `test-all.sh` - Run all tests

### Deployment Scripts
- `deploy.sh` - Deploy to production
- `deploy-docs.sh` - Deploy documentation

## Common Patterns

### Environment Setup

```bash
#!/bin/bash
set -e  # Exit on error
set -u  # Exit on undefined variable

# Load environment
source .env

# Check prerequisites
if ! command -v node &> /dev/null; then
    echo "Node.js is required"
    exit 1
fi
```

### Build Process

```bash
#!/bin/bash

echo "Building NodeTool..."

# Clean previous builds
rm -rf dist/ build/

# Build web UI
cd web
npm run build
cd ..

# Build Electron app
cd electron
npm run build
cd ..

echo "Build complete!"
```

### Error Handling

```bash
#!/bin/bash

# Function to handle errors
handle_error() {
    echo "Error: $1"
    exit 1
}

# Use trap for cleanup
cleanup() {
    echo "Cleaning up..."
    # Cleanup code here
}
trap cleanup EXIT

# Check if command succeeds
npm run build || handle_error "Build failed"
```

### Platform Detection

```bash
#!/bin/bash

# Detect platform
case "$(uname -s)" in
    Darwin*)    platform=macos;;
    Linux*)     platform=linux;;
    CYGWIN*|MINGW*|MSYS*) platform=windows;;
    *)          platform=unknown;;
esac

echo "Platform: $platform"

# Platform-specific logic
if [ "$platform" = "macos" ]; then
    # macOS-specific commands
    echo "Building for macOS..."
fi
```

## Python Build Scripts

For Python build scripts (`build.py`), common patterns:

```python
#!/usr/bin/env python3
import os
import sys
import subprocess
from pathlib import Path

def main():
    """Main build script."""
    print("Building NodeTool...")
    
    # Get project root
    project_root = Path(__file__).parent.parent
    
    # Build web UI
    web_dir = project_root / "web"
    subprocess.run(
        ["npm", "run", "build"],
        cwd=web_dir,
        check=True
    )
    
    # Build Electron
    electron_dir = project_root / "electron"
    subprocess.run(
        ["npm", "run", "build"],
        cwd=electron_dir,
        check=True
    )
    
    print("Build complete!")

if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        print(f"Error: Command failed with exit code {e.returncode}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
```

## Best Practices

### 1. Script Structure
- Start with shebang (`#!/bin/bash` or `#!/usr/bin/env python3`)
- Use `set -e` for bash scripts
- Add help/usage information
- Validate prerequisites

### 2. Error Handling
- Always check command exit codes
- Provide meaningful error messages
- Clean up on failure
- Use trap for cleanup in bash

### 3. Logging
- Print progress messages
- Use consistent formatting
- Include timestamps for long operations
- Log to file for debugging

### 4. Idempotency
- Make scripts safe to run multiple times
- Clean up before building
- Check if work is already done
- Don't fail if already in desired state

### 5. Documentation
- Add comments explaining complex logic
- Document required environment variables
- List prerequisites
- Include usage examples

## Development Workflow

### Local Development
```bash
# Start development environment
./scripts/dev.sh

# Run tests
./scripts/test-all.sh

# Build for testing
./scripts/build.sh --dev
```

### Release Process
```bash
# 1. Update version
npm version patch  # or minor, major

# 2. Build release
./scripts/build.sh --production

# 3. Run tests
./scripts/test-all.sh

# 4. Create release
./scripts/release.sh

# 5. Publish
./scripts/publish.sh
```

## CI/CD Integration

Scripts should work in CI environment:

```bash
#!/bin/bash

# Detect CI environment
if [ -n "$CI" ]; then
    echo "Running in CI mode"
    # CI-specific settings
    export NODE_ENV=production
    export NO_INTERACTIVE=1
fi

# Rest of script
```

## Related Documentation

- [Root AGENTS.md](../AGENTS.md) - Project overview
- [Electron Guide](../electron/src/AGENTS.md) - Electron app
- [Web Guide](../web/src/AGENTS.md) - Web application

## Quick Reference

### Common Commands
```bash
# Build everything
make build

# Clean build artifacts
make clean

# Run tests
make test

# Create release
make release

# Deploy
make deploy
```

### Environment Variables
- `NODE_ENV` - Build environment (development/production)
- `CI` - CI environment indicator
- `SKIP_TESTS` - Skip test execution
- `VERBOSE` - Enable verbose logging

---

**Note**: This guide is for AI coding assistants. For user documentation, see [docs.nodetool.ai](https://docs.nodetool.ai).
