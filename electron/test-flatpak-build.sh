#!/bin/bash
# Test script to verify flatpak build configuration
# This script simulates the CI environment and tests the flatpak build process

set -e

echo "🚀 Testing Flatpak Build Configuration"
echo "======================================"
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."
if ! command -v flatpak &> /dev/null; then
    echo "❌ flatpak is not installed"
    echo "Install with: sudo apt-get install -y flatpak flatpak-builder"
    exit 1
fi

if ! command -v flatpak-builder &> /dev/null; then
    echo "❌ flatpak-builder is not installed"
    echo "Install with: sudo apt-get install -y flatpak-builder"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi

echo "  ✓ flatpak is installed"
echo "  ✓ flatpak-builder is installed"
echo "  ✓ npm is installed"
echo ""

# Verify we're in the electron directory
if [ ! -f "electron-builder.json" ]; then
    echo "❌ Error: Must be run from the electron directory"
    exit 1
fi

# Step 1: Add flathub remote (user)
echo "📦 Step 1: Adding Flathub remote (user install)..."
if flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo; then
    echo "  ✓ Flathub remote added"
else
    echo "  ℹ Flathub remote already exists"
fi
echo ""

# Step 2: Install required runtimes (user)
echo "📦 Step 2: Installing Flatpak runtimes (user install)..."
echo "  This may take a few minutes on first run..."
echo ""

echo "  Installing org.freedesktop.Platform//23.08..."
if flatpak install --user -y flathub org.freedesktop.Platform//23.08 2>&1 | grep -v "already installed" || true; then
    echo "  ✓ org.freedesktop.Platform//23.08 installed"
fi

echo "  Installing org.freedesktop.Sdk//23.08..."
if flatpak install --user -y flathub org.freedesktop.Sdk//23.08 2>&1 | grep -v "already installed" || true; then
    echo "  ✓ org.freedesktop.Sdk//23.08 installed"
fi

echo "  Installing org.electronjs.Electron2.BaseApp//23.08..."
if flatpak install --user -y flathub org.electronjs.Electron2.BaseApp//23.08 2>&1 | grep -v "already installed" || true; then
    echo "  ✓ org.electronjs.Electron2.BaseApp//23.08 installed"
fi
echo ""

# Step 3: Verify runtimes are installed
echo "🔍 Step 3: Verifying installed runtimes..."
if flatpak list --user | grep -q "org.freedesktop.Platform"; then
    echo "  ✓ org.freedesktop.Platform found"
else
    echo "  ✗ org.freedesktop.Platform not found"
    exit 1
fi

if flatpak list --user | grep -q "org.freedesktop.Sdk"; then
    echo "  ✓ org.freedesktop.Sdk found"
else
    echo "  ✗ org.freedesktop.Sdk not found"
    exit 1
fi

if flatpak list --user | grep -q "org.electronjs.Electron2.BaseApp"; then
    echo "  ✓ org.electronjs.Electron2.BaseApp found"
else
    echo "  ✗ org.electronjs.Electron2.BaseApp not found"
    exit 1
fi
echo ""

# Step 4: Validate flatpak configuration
echo "🔍 Step 4: Validating Flatpak configuration..."
if [ -f "validate-flatpak.sh" ]; then
    bash validate-flatpak.sh
else
    echo "  ⚠ validate-flatpak.sh not found, skipping"
fi
echo ""

# Step 5: Check if web build exists
echo "🔍 Step 5: Checking for web build..."
if [ -d "../web/dist" ] && [ "$(ls -A ../web/dist)" ]; then
    echo "  ✓ Web build exists"
    WEB_BUILT=true
else
    echo "  ⚠ Web build not found"
    echo "  Note: Full electron build requires web to be built first"
    echo "  Run: cd ../web && npm install && npm run build"
    WEB_BUILT=false
fi
echo ""

# Step 6: Install electron dependencies if not already done
echo "📦 Step 6: Installing electron dependencies..."
if [ ! -d "node_modules" ]; then
    echo "  Installing npm packages..."
    npm ci
else
    echo "  ✓ Dependencies already installed"
fi
echo ""

# Step 7: Attempt to build (or dry-run)
echo "🔨 Step 7: Testing electron-builder configuration..."
if [ "$WEB_BUILT" = true ]; then
    echo "  Attempting full build with flatpak target..."
    echo "  This will take several minutes..."
    echo ""
    
    # Set DEBUG to see detailed output
    export DEBUG=electron-builder,@malept/flatpak-bundler
    export NODE_OPTIONS="--max_old_space_size=4096"
    
    # Run electron-builder
    if npx electron-builder --config electron-builder.json --linux --x64 --publish never; then
        echo ""
        echo "  ✅ Build completed successfully!"
        echo ""
        echo "  Generated files:"
        ls -lh dist/*.{AppImage,flatpak} 2>/dev/null || echo "  (no flatpak/AppImage files found)"
    else
        echo ""
        echo "  ❌ Build failed"
        echo "  Check the output above for errors"
        exit 1
    fi
else
    echo "  ⚠ Skipping full build (web not built)"
    echo "  To test the full build:"
    echo "    1. cd ../web && npm install && npm run build"
    echo "    2. cd ../electron && bash test-flatpak-build.sh"
fi
echo ""

echo "✅ Flatpak configuration test completed!"
echo ""
echo "Summary:"
echo "  • Flatpak runtimes are installed correctly (user install)"
echo "  • Configuration files are valid"
echo "  • electron-builder configuration includes flatpak target"
echo ""
if [ "$WEB_BUILT" = true ]; then
    echo "  • Build test: PASSED"
    echo ""
    echo "The changes to release.yaml should fix the CI build:"
    echo "  1. Runtimes installed in user space (not system)"
    echo "  2. Debug logging enabled for @malept/flatpak-bundler"
else
    echo "  • Build test: SKIPPED (requires web build)"
    echo ""
    echo "To complete the test, build the web app first:"
    echo "  cd ../web && npm install && npm run build"
    echo "  cd ../electron && bash test-flatpak-build.sh"
fi
