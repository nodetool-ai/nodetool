#Requires -Version 5.1
<#
.SYNOPSIS
    NodeTool CLI Installer for Windows

.DESCRIPTION
    A portable, self-contained PowerShell installer that bootstraps a complete
    NodeTool CLI environment using micromamba and installs nodetool-core and
    nodetool-base packages from the NodeTool registry.

.PARAMETER Prefix
    Installation directory. Default: $env:USERPROFILE\.nodetool

.PARAMETER Yes
    Non-interactive mode, skip confirmation prompts.

.PARAMETER Help
    Show help message.

.EXAMPLE
    # Basic installation
    .\install.ps1

    # Custom installation directory
    .\install.ps1 -Prefix "C:\nodetool"

    # Non-interactive installation
    .\install.ps1 -Yes

    # One-liner installation (run in PowerShell)
    irm https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.ps1 | iex

.LINK
    https://github.com/nodetool-ai/nodetool

.NOTES
    License: Apache-2.0
#>

[CmdletBinding()]
param(
    [string]$Prefix,
    [switch]$Yes,
    [switch]$Help
)

# ==============================================================================
# Configuration
# ==============================================================================

$MICROMAMBA_VERSION = "2.3.3-0"
$MICROMAMBA_RELEASE_URL = "https://github.com/mamba-org/micromamba-releases/releases/download/$MICROMAMBA_VERSION"
$NODETOOL_REGISTRY = "https://nodetool-ai.github.io/nodetool-registry/simple/"
$PYPI_INDEX = "https://pypi.org/simple"

# Python packages to install from the registry
$PYTHON_PACKAGES = @(
    "nodetool-core"
    "nodetool-base"
)

# Conda dependencies from conda-forge
$CONDA_DEPENDENCIES = @(
    "python=3.11"
    "ffmpeg>=6,<7"
    "cairo"
    "git"
    "x264"
    "x265"
    "aom"
    "libopus"
    "libvorbis"
    "libpng"
    "libjpeg-turbo"
    "libtiff"
    "openjpeg"
    "libwebp"
    "giflib"
    "lame"
    "pandoc"
    "uv"
    "lua"
    "nodejs>=20"
    "pip"
)

# ==============================================================================
# Color and Output Utilities
# ==============================================================================

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] " -ForegroundColor Blue -NoNewline
    Write-Host $Message
}

function Write-Success {
    param([string]$Message)
    Write-Host "[✓] " -ForegroundColor Green -NoNewline
    Write-Host $Message
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] " -ForegroundColor Red -NoNewline
    Write-Host $Message
}

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

# ==============================================================================
# Utility Functions
# ==============================================================================

function Show-Help {
    @"

NodeTool CLI Installer for Windows

Usage: .\install.ps1 [OPTIONS]

Options:
    -Prefix DIR     Installation directory (default: $env:USERPROFILE\.nodetool)
    -Yes            Non-interactive mode, skip confirmation prompts
    -Help           Show this help message

Environment Variables:
    NODETOOL_HOME   Custom installation directory

Examples:
    # Install with defaults
    .\install.ps1

    # Install to a custom location
    .\install.ps1 -Prefix "C:\nodetool"

    # Non-interactive installation
    .\install.ps1 -Yes

    # One-liner installation (PowerShell)
    irm https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.ps1 | iex

"@
}

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Confirm-Action {
    param(
        [string]$Prompt,
        [bool]$Default = $true
    )

    if ($Yes) {
        return $true
    }

    $choices = if ($Default) { "[Y/n]" } else { "[y/N]" }
    $response = Read-Host "$Prompt $choices"

    if ([string]::IsNullOrWhiteSpace($response)) {
        return $Default
    }

    return $response -match "^[yY]"
}

function Invoke-Download {
    param(
        [string]$Url,
        [string]$Destination
    )

    Write-Info "Downloading: $Url"

    try {
        # Use TLS 1.2
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

        # Create WebClient for download
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($Url, $Destination)
        $webClient.Dispose()

        if (-not (Test-Path $Destination) -or (Get-Item $Destination).Length -eq 0) {
            throw "Downloaded file is empty or missing"
        }

        return $true
    }
    catch {
        Write-Error-Custom "Download failed: $_"
        return $false
    }
}

# ==============================================================================
# Installation Functions
# ==============================================================================

function Initialize-Directories {
    Write-Step "Setting up installation directories"

    try {
        New-Item -ItemType Directory -Force -Path $script:NODETOOL_HOME | Out-Null
        New-Item -ItemType Directory -Force -Path "$script:MICROMAMBA_DIR\Library\bin" | Out-Null
        New-Item -ItemType Directory -Force -Path "$script:NODETOOL_HOME\bin" | Out-Null
        New-Item -ItemType Directory -Force -Path "$script:NODETOOL_HOME\cache" | Out-Null

        Write-Success "Created directory structure at $script:NODETOOL_HOME"
    }
    catch {
        throw "Failed to create directories: $_"
    }
}

function Install-Micromamba {
    Write-Step "Downloading micromamba $MICROMAMBA_VERSION"

    # Detect Windows architecture (future-proofing for ARM64 support)
    $micromambaArch = "win-64"
    $micromambaUrl = "$MICROMAMBA_RELEASE_URL/micromamba-$micromambaArch.exe"
    $micromambaPath = "$script:MICROMAMBA_DIR\Library\bin\micromamba.exe"

    # Check if micromamba already exists and is working
    if (Test-Path $micromambaPath) {
        try {
            $null = & $micromambaPath --version 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Info "micromamba already installed and working"
                $script:MICROMAMBA_EXE = $micromambaPath
                return
            }
        }
        catch {
            Write-Warn "Existing micromamba is not working, re-downloading..."
        }
    }

    Write-Info "Downloading micromamba for Windows x64..."

    if (-not (Invoke-Download -Url $micromambaUrl -Destination $micromambaPath)) {
        throw "Failed to download micromamba from $micromambaUrl"
    }

    # Verify the binary works
    try {
        $version = & $micromambaPath --version 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "micromamba returned non-zero exit code"
        }
        Write-Success "Installed micromamba version: $version"
    }
    catch {
        Remove-Item -Path $micromambaPath -Force -ErrorAction SilentlyContinue
        throw "Downloaded micromamba binary is not working: $_"
    }

    $script:MICROMAMBA_EXE = $micromambaPath
}

function New-CondaEnvironment {
    Write-Step "Creating conda environment with dependencies"

    Write-Info "This may take several minutes..."

    $env:MAMBA_ROOT_PREFIX = $script:MICROMAMBA_DIR

    # Build the dependency arguments
    $depsArgs = @("--channel", "conda-forge")
    foreach ($dep in $CONDA_DEPENDENCIES) {
        $depsArgs += $dep
    }

    # Check if environment already exists
    if (Test-Path $script:ENV_DIR) {
        Write-Info "Environment directory already exists, updating..."

        $updateArgs = @("install", "--yes", "--prefix", $script:ENV_DIR) + $depsArgs

        try {
            & $script:MICROMAMBA_EXE @updateArgs 2>&1 | ForEach-Object { Write-Host $_ }
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Updated conda environment"
                return
            }
        }
        catch {
            Write-Warn "Update failed, recreating environment..."
        }

        Remove-Item -Path $script:ENV_DIR -Recurse -Force -ErrorAction SilentlyContinue
    }

    # Create new environment
    Write-Info "Creating new conda environment..."

    $createArgs = @("create", "--yes", "--prefix", $script:ENV_DIR) + $depsArgs

    try {
        & $script:MICROMAMBA_EXE @createArgs 2>&1 | ForEach-Object { Write-Host $_ }
        if ($LASTEXITCODE -ne 0) {
            throw "micromamba create failed with exit code $LASTEXITCODE"
        }
    }
    catch {
        throw "Failed to create conda environment: $_"
    }

    Write-Success "Created conda environment with all dependencies"
}

function Install-PythonPackages {
    Write-Step "Installing Python packages from NodeTool registry"

    $uvPath = "$script:ENV_DIR\Scripts\uv.exe"
    $uvPathAlt = "$script:ENV_DIR\Library\bin\uv.exe"

    if (-not (Test-Path $uvPath)) {
        # Try alternate location
        $uvPath = $uvPathAlt
        if (-not (Test-Path $uvPath)) {
            throw "uv not found in conda environment. Checked: $script:ENV_DIR\Scripts\uv.exe and $uvPathAlt. The conda environment creation may have failed. Try removing $script:ENV_DIR and running the installer again."
        }
    }

    Write-Info "Installing: $($PYTHON_PACKAGES -join ', ')"

    $env:Path = "$script:ENV_DIR\Scripts;$script:ENV_DIR\Library\bin;$env:Path"
    
    # Get the path to Python in the conda environment
    $pythonPath = "$script:ENV_DIR\python.exe"
    if (-not (Test-Path $pythonPath)) {
        $pythonPath = "$script:ENV_DIR\Scripts\python.exe"
    }

    $pipArgs = @(
        "pip", "install"
    ) + $PYTHON_PACKAGES + @(
        "--python", $pythonPath,
        "--index-url", $NODETOOL_REGISTRY,
        "--extra-index-url", $PYPI_INDEX,
        "--pre"
    )

    try {
        & $uvPath @pipArgs 2>&1 | ForEach-Object { Write-Host $_ }
        if ($LASTEXITCODE -ne 0) {
            throw "uv pip install failed with exit code $LASTEXITCODE"
        }
    }
    catch {
        throw "Failed to install Python packages: $_"
    }

    Write-Success "Installed Python packages successfully"
}

function New-WrapperScript {
    Write-Step "Creating wrapper scripts"

    # Create batch file wrapper
    $batchWrapperPath = "$script:NODETOOL_HOME\bin\nodetool.cmd"
    $batchContent = @"
@echo off
REM NodeTool CLI wrapper script
REM Auto-generated by the NodeTool installer

set "NODETOOL_HOME=%~dp0.."
set "MAMBA_ROOT_PREFIX=%NODETOOL_HOME%\micromamba"
set "PATH=%NODETOOL_HOME%\env\Scripts;%NODETOOL_HOME%\env\Library\bin;%PATH%"

REM Set cache directories for models
if not defined HF_HOME set "HF_HOME=%NODETOOL_HOME%\cache\huggingface"
if not defined OLLAMA_MODELS set "OLLAMA_MODELS=%NODETOOL_HOME%\cache\ollama"

"%NODETOOL_HOME%\env\python.exe" -m nodetool.cli %*
"@

    Set-Content -Path $batchWrapperPath -Value $batchContent -Encoding ASCII

    # Create PowerShell wrapper
    $psWrapperPath = "$script:NODETOOL_HOME\bin\nodetool.ps1"
    $psContent = @'
#Requires -Version 5.1
<#
.SYNOPSIS
    NodeTool CLI wrapper script
.DESCRIPTION
    Auto-generated by the NodeTool installer
#>

$ErrorActionPreference = "Stop"

$NODETOOL_HOME = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$env:MAMBA_ROOT_PREFIX = "$NODETOOL_HOME\micromamba"
$env:Path = "$NODETOOL_HOME\env\Scripts;$NODETOOL_HOME\env\Library\bin;$env:Path"

# Set cache directories for models
if (-not $env:HF_HOME) { $env:HF_HOME = "$NODETOOL_HOME\cache\huggingface" }
if (-not $env:OLLAMA_MODELS) { $env:OLLAMA_MODELS = "$NODETOOL_HOME\cache\ollama" }

& "$NODETOOL_HOME\env\python.exe" -m nodetool.cli @args
exit $LASTEXITCODE
'@

    Set-Content -Path $psWrapperPath -Value $psContent -Encoding UTF8

    Write-Success "Created wrapper scripts at $script:NODETOOL_HOME\bin"
}

function Test-Installation {
    Write-Step "Verifying installation"

    $wrapperPath = "$script:NODETOOL_HOME\bin\nodetool.cmd"

    if (-not (Test-Path $wrapperPath)) {
        throw "Wrapper script not found"
    }

    Write-Info "Testing nodetool CLI..."

    try {
        $null = & $wrapperPath --help 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "nodetool --help returned non-zero exit code, but installation may still be usable"
            Write-Warn "Try running: $wrapperPath --help"
        }
        else {
            Write-Success "nodetool CLI is working"
        }
    }
    catch {
        Write-Warn "nodetool --help failed: $_"
        Write-Warn "Installation may still be usable. Try running: $wrapperPath --help"
    }
}

function Show-CompletionMessage {
    $binPath = "$script:NODETOOL_HOME\bin"

    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║                   NodeTool Installation Complete!                ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "Installation directory: " -NoNewline
    Write-Host $script:NODETOOL_HOME -ForegroundColor White
    Write-Host ""
    Write-Host "To use nodetool, add it to your PATH:" -ForegroundColor White
    Write-Host ""
    Write-Host "    PowerShell (current session):" -ForegroundColor Gray
    Write-Host "    `$env:Path = `"$binPath;`$env:Path`"" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "    PowerShell (permanent for current user):" -ForegroundColor Gray
    Write-Host "    [Environment]::SetEnvironmentVariable('Path', `"$binPath;`$([Environment]::GetEnvironmentVariable('Path', 'User'))`", 'User')" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Quick start:" -ForegroundColor White
    Write-Host ""
    Write-Host "    nodetool --help              " -ForegroundColor Cyan -NoNewline
    Write-Host "# Show available commands" -ForegroundColor Gray
    Write-Host "    nodetool serve --port 7777   " -ForegroundColor Cyan -NoNewline
    Write-Host "# Start the NodeTool server" -ForegroundColor Gray
    Write-Host "    nodetool worker --host 0.0.0.0 " -ForegroundColor Cyan -NoNewline
    Write-Host "# Start a worker" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Documentation: " -NoNewline
    Write-Host "https://github.com/nodetool-ai/nodetool" -ForegroundColor Blue
    Write-Host ""
}

function Add-ToPathInteractive {
    if ($Yes) {
        return
    }

    $binPath = "$script:NODETOOL_HOME\bin"

    Write-Host ""
    if (Confirm-Action "Would you like to add nodetool to your user PATH permanently?") {
        try {
            $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")

            if ($currentPath -like "*$binPath*") {
                Write-Info "PATH already contains nodetool"
            }
            else {
                $newPath = "$binPath;$currentPath"
                [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
                $env:Path = "$binPath;$env:Path"
                Write-Success "Added nodetool to user PATH"
                Write-Info "Please restart your terminal for the change to take effect"
            }
        }
        catch {
            Write-Warn "Failed to add to PATH: $_"
            Write-Info "You can add it manually using the commands shown above"
        }
    }
}

# ==============================================================================
# Main
# ==============================================================================

function Main {
    if ($Help) {
        Show-Help
        return
    }

    # Determine installation directory
    $script:NODETOOL_HOME = if ($Prefix) {
        $Prefix
    }
    elseif ($env:NODETOOL_HOME) {
        $env:NODETOOL_HOME
    }
    else {
        "$env:USERPROFILE\.nodetool"
    }

    # Set up paths
    $script:MICROMAMBA_DIR = "$script:NODETOOL_HOME\micromamba"
    $script:ENV_DIR = "$script:NODETOOL_HOME\env"

    # Show banner
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                     NodeTool CLI Installer                       ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""

    Write-Info "Installation directory: $script:NODETOOL_HOME"
    Write-Host ""

    # Confirm installation
    if (-not (Confirm-Action "Proceed with installation?")) {
        Write-Info "Installation cancelled by user"
        return
    }

    try {
        # Check if running as administrator (just a warning, not required)
        if (-not (Test-Administrator)) {
            Write-Warn "Not running as Administrator. Installation will proceed for current user only."
        }

        # Initialize directories
        Initialize-Directories

        # Download and install micromamba
        Install-Micromamba

        # Create conda environment
        New-CondaEnvironment

        # Install Python packages
        Install-PythonPackages

        # Create wrapper scripts
        New-WrapperScript

        # Verify installation
        Test-Installation

        # Show completion message
        Show-CompletionMessage

        # Offer to add to PATH
        Add-ToPathInteractive

        Write-Success "NodeTool installation complete!"
    }
    catch {
        Write-Error-Custom "$_"
        Write-Host ""
        Write-Error-Custom "Installation failed. Please check the error message above."
        Write-Error-Custom "For troubleshooting, see: https://github.com/nodetool-ai/nodetool#troubleshooting"
        exit 1
    }
}

# Run main function
Main
