#!/bin/bash
# Test script to validate Flatpak configuration
# This script checks that all required files and dependencies are in place

set -e

echo "🔍 Validating Flatpak configuration for Nodetool..."
echo ""

# Check if we're in the electron directory
if [ ! -f "electron-builder.json" ]; then
    echo "❌ Error: Must be run from the electron directory"
    exit 1
fi

# Check for required files
echo "📋 Checking required files..."

required_files=(
    "electron-builder.json"
    "resources/ai.nodetool.NodeTool.desktop"
    "resources/ai.nodetool.NodeTool.metainfo.xml"
    "ai.nodetool.NodeTool.yml"
    "resources/icon.png"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ✗ $file (missing)"
        exit 1
    fi
done

echo ""
echo "🔧 Checking icon files..."

icon_sizes=(16 24 32 48 64 128 256 512)
missing_icons=0

for size in "${icon_sizes[@]}"; do
    icon_file="resources/linux_icons/icon_${size}x${size}.png"
    if [ -f "$icon_file" ]; then
        echo "  ✓ ${size}x${size} icon"
    else
        echo "  ⚠ ${size}x${size} icon (missing, but optional)"
        missing_icons=$((missing_icons + 1))
    fi
done

echo ""
echo "📦 Checking Node.js dependencies..."

if command -v npm &> /dev/null; then
    echo "  ✓ npm is installed"
    
    if npm list electron-builder --depth=0 &> /dev/null; then
        echo "  ✓ electron-builder is installed"
    else
        echo "  ✗ electron-builder is not installed (run: npm install)"
        exit 1
    fi
    
    if npm list @malept/flatpak-bundler --depth=0 &> /dev/null; then
        echo "  ✓ @malept/flatpak-bundler is available"
    else
        echo "  ⚠ @malept/flatpak-bundler not found (should be installed with electron-builder)"
    fi
else
    echo "  ✗ npm is not installed"
    exit 1
fi

echo ""
echo "📄 Validating file formats..."

# Validate JSON
if command -v python3 &> /dev/null; then
    if python3 -m json.tool electron-builder.json > /dev/null 2>&1; then
        echo "  ✓ electron-builder.json is valid JSON"
    else
        echo "  ✗ electron-builder.json has syntax errors"
        exit 1
    fi
    
    if python3 -c "import yaml; yaml.safe_load(open('ai.nodetool.NodeTool.yml'))" 2>/dev/null; then
        echo "  ✓ ai.nodetool.NodeTool.yml is valid YAML"
    else
        echo "  ✗ ai.nodetool.NodeTool.yml has syntax errors"
        exit 1
    fi
    
    if python3 -c "import xml.etree.ElementTree as ET; ET.parse('resources/ai.nodetool.NodeTool.metainfo.xml')" 2>/dev/null; then
        echo "  ✓ ai.nodetool.NodeTool.metainfo.xml is valid XML"
    else
        echo "  ✗ ai.nodetool.NodeTool.metainfo.xml has syntax errors"
        exit 1
    fi
else
    echo "  ⚠ Python3 not available, skipping file validation"
fi

echo ""
echo "✅ All validation checks passed!"
echo ""
echo "To build Flatpak package, run:"
echo "  npm run build"
echo ""
echo "The Flatpak will be created in the dist/ directory."
echo ""
echo "Note: Building Flatpak requires:"
echo "  - flatpak-builder (for production builds)"
echo "  - org.freedesktop.Platform runtime (will be downloaded automatically)"
