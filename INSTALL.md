# NodeTool CLI Installer

A portable, self-contained installer that bootstraps a complete NodeTool CLI environment using [micromamba](https://mamba.readthedocs.io/en/latest/user_guide/micromamba.html) and installs `nodetool-core` and `nodetool-base` packages from the [NodeTool registry](https://nodetool-ai.github.io/nodetool-registry/).

## Quick Start

### One-liner Installation

**Linux / macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.ps1 | iex
```

### After Installation

Add NodeTool to your PATH (the installer will prompt to do this automatically):

```bash
# Linux/macOS
export PATH="$HOME/.nodetool/bin:$PATH"

# Windows (PowerShell)
$env:Path = "$env:USERPROFILE\.nodetool\bin;$env:Path"
```

Then start using NodeTool:

```bash
nodetool --help              # Show available commands
nodetool serve --port 7777   # Start the NodeTool server
nodetool worker --host 0.0.0.0  # Start a worker
```

## Platform Support

| Platform | Architecture | Status |
|----------|-------------|--------|
| Linux    | x86_64      | ✅ Supported |
| Linux    | ARM64       | ✅ Supported |
| macOS    | x86_64      | ✅ Supported |
| macOS    | ARM64 (Apple Silicon) | ✅ Supported |
| Windows  | x64         | ✅ Supported |

## Installation Options

### Custom Installation Directory

By default, NodeTool installs to `~/.nodetool` (Linux/macOS) or `%USERPROFILE%\.nodetool` (Windows).

**Using --prefix flag:**
```bash
# Linux/macOS
./install.sh --prefix /opt/nodetool

# Windows
.\install.ps1 -Prefix "C:\nodetool"
```

**Using environment variable:**
```bash
# Linux/macOS
NODETOOL_HOME=/opt/nodetool ./install.sh

# Windows
$env:NODETOOL_HOME = "C:\nodetool"
.\install.ps1
```

### Non-interactive Installation

Skip confirmation prompts for scripted installations:

```bash
# Linux/macOS
./install.sh -y

# Windows
.\install.ps1 -Yes
```

### Download and Run with Options

```bash
# Linux/macOS
curl -fsSL https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.sh -o install.sh
chmod +x install.sh
./install.sh --prefix ~/custom-nodetool -y

# Windows (PowerShell)
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.ps1" -OutFile "install.ps1"
.\install.ps1 -Prefix "$HOME\custom-nodetool" -Yes
```

## What Gets Installed

The installer creates a self-contained environment with the following structure:

```
$NODETOOL_HOME/              # Default: ~/.nodetool
├── micromamba/
│   └── bin/
│       └── micromamba       # micromamba binary
├── env/                     # conda environment
│   ├── bin/                 # (or Scripts/ on Windows)
│   │   ├── python
│   │   ├── uv
│   │   └── ...
│   └── lib/
├── bin/
│   └── nodetool             # wrapper script
└── cache/                   # HuggingFace/Ollama model cache
    ├── huggingface/
    └── ollama/
```

### Conda Dependencies

The following packages are installed from conda-forge:

- Python 3.11
- ffmpeg (with x264, x265, aom, opus, vorbis codecs)
- cairo
- git
- pandoc
- uv (Python package installer)
- lua
- Node.js 20+
- Various media libraries (libpng, libjpeg-turbo, libtiff, etc.)

### Python Packages

The following packages are installed from the NodeTool registry:

- `nodetool-core` - Core NodeTool functionality
- `nodetool-base` - Base nodes and utilities

## Updating

To update an existing installation, simply run the installer again. It will update the environment in place:

```bash
# Linux/macOS
curl -fsSL https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.sh | bash -s -- -y

# Windows
irm https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.ps1 | iex
```

## Uninstallation

To completely remove NodeTool:

```bash
# Linux/macOS
rm -rf ~/.nodetool

# Also remove from your shell config file if you added it:
# Remove the line: export PATH="$HOME/.nodetool/bin:$PATH"
```

```powershell
# Windows
Remove-Item -Recurse -Force "$env:USERPROFILE\.nodetool"

# Remove from PATH if you added it permanently:
$path = [Environment]::GetEnvironmentVariable("Path", "User")
$path = ($path.Split(";") | Where-Object { $_ -notlike "*\.nodetool\*" }) -join ";"
[Environment]::SetEnvironmentVariable("Path", $path, "User")
```

## Troubleshooting

### Common Issues

#### "curl: command not found" or "wget: command not found"

Install curl or wget using your system package manager:

```bash
# Ubuntu/Debian
sudo apt-get install curl

# CentOS/RHEL
sudo yum install curl

# macOS (curl is pre-installed)
# If needed: brew install curl
```

#### "Permission denied" errors

Make sure you have write permissions to the installation directory:

```bash
# Check permissions
ls -la ~/.nodetool

# Or install to a different location
./install.sh --prefix ~/my-nodetool
```

#### "micromamba: command not found" after installation

The wrapper script handles environment activation automatically. Make sure you're using the wrapper:

```bash
# Use the full path
~/.nodetool/bin/nodetool --help

# Or add to PATH
export PATH="$HOME/.nodetool/bin:$PATH"
nodetool --help
```

#### Slow installation

The initial installation downloads and installs many packages. This is normal and may take 5-15 minutes depending on your internet connection.

#### Network/Proxy issues

If you're behind a proxy, configure it before running the installer:

```bash
# Linux/macOS
export HTTP_PROXY="http://proxy.example.com:8080"
export HTTPS_PROXY="http://proxy.example.com:8080"
./install.sh

# Windows
$env:HTTP_PROXY = "http://proxy.example.com:8080"
$env:HTTPS_PROXY = "http://proxy.example.com:8080"
.\install.ps1
```

### Getting Help

If you encounter issues not covered here:

1. Check the [NodeTool Issues](https://github.com/nodetool-ai/nodetool/issues) page
2. Open a new issue with:
   - Your operating system and version
   - The complete error message
   - The command you ran

## Environment Variables

The wrapper script sets up the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MAMBA_ROOT_PREFIX` | micromamba root directory | `$NODETOOL_HOME/micromamba` |
| `HF_HOME` | HuggingFace cache directory | `$NODETOOL_HOME/cache/huggingface` |
| `OLLAMA_MODELS` | Ollama models directory | `$NODETOOL_HOME/cache/ollama` |

You can override these by setting them before running the `nodetool` command.

## Advanced Usage

### Using a Different Python Version

The installer uses Python 3.11 by default. To use a different version, you'll need to modify the installer script or create your own environment.

### Running Without the Wrapper

You can also run nodetool directly using the environment's Python:

```bash
# Activate the environment manually
export MAMBA_ROOT_PREFIX="$HOME/.nodetool/micromamba"
export PATH="$HOME/.nodetool/env/bin:$PATH"

# Run nodetool
python -m nodetool.cli --help
```

### Integration with Development Workflows

For development, you might want to use the environment directly:

```bash
# Get the Python path
~/.nodetool/env/bin/python --version

# Install additional packages
~/.nodetool/env/bin/uv pip install some-package
```

## License

This installer is part of NodeTool and is licensed under the [Apache-2.0 License](LICENSE.txt).

The installer uses [micromamba](https://github.com/mamba-org/mamba) which is licensed under the BSD-3-Clause License.
