#!/usr/bin/env bash
#
# NodeTool CLI Installer
# ======================
#
# A portable shell installer that creates the Python environment for
# NodeTool's Python nodes with micromamba, then installs nodetool-core and
# any chosen packs from PyPI. The NodeTool server itself is the Node.js CLI.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.sh | bash
#   
#   # Or with options:
#   ./install.sh --prefix ~/.local/share/nodetool --pack huggingface -y
#
# Environment Variables:
#   NODETOOL_HOME - Custom installation directory
#                   (default: ~/.local/share/nodetool)
#
# Options:
#   --prefix DIR    Installation directory (overrides NODETOOL_HOME)
#   --pack NAME     Also install a Python pack: huggingface or mlx (repeatable)
#   -y, --yes       Non-interactive mode, skip confirmation prompts
#   --help          Show this help message
#
# Repository: https://github.com/nodetool-ai/nodetool
# License: Apache-2.0
#

set -euo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

MICROMAMBA_VERSION="2.3.3-0"
MICROMAMBA_RELEASE_URL="https://github.com/mamba-org/micromamba-releases/releases/download/${MICROMAMBA_VERSION}"

# Conda dependencies from conda-forge
CONDA_DEPENDENCIES=(
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
)

# ==============================================================================
# Color and Output Utilities
# ==============================================================================

# Colors (disabled if not a terminal)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    BOLD=''
    NC=''
fi

info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

success() {
    echo -e "${GREEN}[✓]${NC} $*"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

step() {
    echo -e "\n${CYAN}${BOLD}==> $*${NC}"
}

# ==============================================================================
# Error Handling and Cleanup
# ==============================================================================

CLEANUP_DIRS=()
CLEANUP_FILES=()

cleanup() {
    local exit_code=$?
    
    # Only clean up on failure
    if [[ $exit_code -ne 0 ]]; then
        warn "Installation failed. Cleaning up partial installation..."
        
        for file in "${CLEANUP_FILES[@]}"; do
            if [[ -f "$file" ]]; then
                rm -f "$file" 2>/dev/null || true
            fi
        done
        
        for dir in "${CLEANUP_DIRS[@]}"; do
            if [[ -d "$dir" ]]; then
                rm -rf "$dir" 2>/dev/null || true
            fi
        done
    fi
    
    exit $exit_code
}

trap cleanup EXIT

die() {
    error "$@"
    echo ""
    error "Installation failed. Please check the error message above."
    error "For troubleshooting, see: https://github.com/nodetool-ai/nodetool#troubleshooting"
    exit 1
}

# ==============================================================================
# Platform Detection
# ==============================================================================

detect_platform() {
    local os arch
    
    os="$(uname -s)"
    arch="$(uname -m)"
    
    case "$os" in
        Linux)
            OS="linux"
            ;;
        Darwin)
            OS="osx"
            ;;
        *)
            die "Unsupported operating system: $os"
            ;;
    esac
    
    case "$arch" in
        x86_64|amd64)
            ARCH="64"
            MICROMAMBA_ARCH="64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            if [[ "$OS" == "linux" ]]; then
                MICROMAMBA_ARCH="aarch64"
            else
                MICROMAMBA_ARCH="arm64"
            fi
            ;;
        *)
            die "Unsupported architecture: $arch"
            ;;
    esac
    
    PLATFORM="${OS}-${ARCH}"
    MICROMAMBA_PLATFORM="${OS}-${MICROMAMBA_ARCH}"
    
    info "Detected platform: $PLATFORM"
}

# ==============================================================================
# Utility Functions
# ==============================================================================

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

check_prerequisites() {
    step "Checking prerequisites"
    
    # Check for curl or wget
    if command_exists curl; then
        DOWNLOADER="curl"
        info "Found curl for downloads"
    elif command_exists wget; then
        DOWNLOADER="wget"
        info "Found wget for downloads"
    else
        die "Neither curl nor wget found. Please install one of them and try again."
    fi
    
    # Check for tar (needed for some operations)
    if ! command_exists tar; then
        die "tar not found. Please install tar and try again."
    fi
    
    success "All prerequisites met"
}

download_file() {
    local url="$1"
    local dest="$2"
    
    info "Downloading: $url"
    
    if [[ "$DOWNLOADER" == "curl" ]]; then
        curl -fsSL --retry 3 --retry-delay 2 -o "$dest" "$url" || return 1
    else
        wget -q --tries=3 --waitretry=2 -O "$dest" "$url" || return 1
    fi
    
    if [[ ! -f "$dest" || ! -s "$dest" ]]; then
        return 1
    fi
    
    return 0
}

confirm() {
    local prompt="$1"
    local default="${2:-y}"
    
    if [[ "$NOCONFIRM" == "true" ]]; then
        return 0
    fi
    
    if [[ "$default" == "y" ]]; then
        prompt="$prompt [Y/n] "
    else
        prompt="$prompt [y/N] "
    fi
    
    read -rp "$prompt" response
    response="${response:-$default}"
    
    case "$response" in
        [yY][eE][sS]|[yY])
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# ==============================================================================
# Installation Functions
# ==============================================================================

setup_directories() {
    step "Setting up installation directories"
    
    # Create main directories
    mkdir -p "$NODETOOL_HOME"
    mkdir -p "$MICROMAMBA_DIR/bin"
    
    success "Created directory structure at $NODETOOL_HOME"
}

download_micromamba() {
    step "Downloading micromamba ${MICROMAMBA_VERSION}"
    
    local micromamba_binary="micromamba-${MICROMAMBA_PLATFORM}"
    local micromamba_url="${MICROMAMBA_RELEASE_URL}/${micromamba_binary}"
    local micromamba_path="${MICROMAMBA_DIR}/bin/micromamba"
    
    # Check if micromamba already exists and is working
    if [[ -x "$micromamba_path" ]]; then
        if "$micromamba_path" --version >/dev/null 2>&1; then
            info "micromamba already installed and working"
            MICROMAMBA_EXE="$micromamba_path"
            return 0
        else
            warn "Existing micromamba is not working, re-downloading..."
        fi
    fi
    
    info "Downloading micromamba for $MICROMAMBA_PLATFORM..."
    
    if ! download_file "$micromamba_url" "$micromamba_path"; then
        die "Failed to download micromamba from $micromamba_url"
    fi
    
    chmod +x "$micromamba_path"
    
    # Verify the binary works
    if ! "$micromamba_path" --version >/dev/null 2>&1; then
        rm -f "$micromamba_path"
        die "Downloaded micromamba binary is not executable or corrupted"
    fi
    
    MICROMAMBA_EXE="$micromamba_path"
    local version
    version=$("$MICROMAMBA_EXE" --version 2>/dev/null || echo "unknown")
    success "Installed micromamba version: $version"
}

create_conda_environment() {
    step "Creating conda environment with dependencies"
    
    info "This may take several minutes..."
    
    export MAMBA_ROOT_PREFIX="$MICROMAMBA_DIR"
    
    # Build the dependency string
    local deps_args=()
    for dep in "${CONDA_DEPENDENCIES[@]}"; do
        deps_args+=("$dep")
    done
    
    # Check if environment already exists
    if [[ -d "$ENV_DIR" ]]; then
        info "Environment directory already exists, updating..."
        
        # Update existing environment
        if ! "$MICROMAMBA_EXE" install \
            --yes \
            --prefix "$ENV_DIR" \
            --channel conda-forge \
            "${deps_args[@]}"; then
            warn "Update failed, recreating environment..."
            rm -rf "$ENV_DIR"
        else
            success "Updated conda environment"
            return 0
        fi
    fi
    
    # Create new environment
    info "Creating new conda environment..."
    CLEANUP_DIRS+=("$ENV_DIR")
    
    if ! "$MICROMAMBA_EXE" create \
        --yes \
        --prefix "$ENV_DIR" \
        --channel conda-forge \
        "${deps_args[@]}"; then
        die "Failed to create conda environment"
    fi
    
    # Remove from cleanup since it succeeded (proper array element removal)
    local new_cleanup=()
    for item in "${CLEANUP_DIRS[@]}"; do
        if [[ "$item" != "$ENV_DIR" ]]; then
            new_cleanup+=("$item")
        fi
    done
    CLEANUP_DIRS=("${new_cleanup[@]+${new_cleanup[@]}}")
    
    success "Created conda environment with all dependencies"
}

# Pack name -> PyPI distribution, and the platforms the pack supports.
# Mirrors PYTHON_PACKS in packages/protocol/src/python-packs.ts.
pack_distribution() {
    case "$1" in
        huggingface) echo "nodetool-huggingface" ;;
        mlx) echo "nodetool-mlx" ;;
        *) return 1 ;;
    esac
}

pack_supported() {
    case "$1" in
        mlx)
            [[ "$PLATFORM" == "osx-arm64" ]]
            ;;
        huggingface)
            # PyTorch publishes no wheels for Intel Macs.
            [[ "$PLATFORM" != "osx-64" ]]
            ;;
        *)
            return 1
            ;;
    esac
}

install_python_packages() {
    step "Installing Python packages from PyPI"

    local uv_path="${ENV_DIR}/bin/uv"

    if [[ ! -x "$uv_path" ]]; then
        die "uv not found in conda environment at $uv_path. This may indicate the conda environment creation failed. Try removing $ENV_DIR and running the installer again."
    fi

    local requirements=("nodetool-core")
    local needs_torch="false"
    local pack dist
    for pack in "${PACKS[@]+${PACKS[@]}}"; do
        if ! dist="$(pack_distribution "$pack")"; then
            die "Unknown pack: $pack. Available packs: huggingface, mlx"
        fi
        if ! pack_supported "$pack"; then
            die "The $pack pack does not support $PLATFORM. MLX needs a Mac with Apple Silicon, and PyTorch has no build for Intel Macs."
        fi
        requirements+=("$dist")
        needs_torch="true"
    done

    # One resolve for core and every pack, so pack pins cannot downgrade core.
    local torch_args=()
    if [[ "$needs_torch" == "true" && "$OS" == "linux" ]]; then
        # uv detects the GPU driver and routes torch to the matching PyTorch index.
        torch_args=(--torch-backend auto)
    fi

    info "Installing: ${requirements[*]}"

    if ! "$uv_path" pip install \
        --python "${ENV_DIR}/bin/python" \
        "${torch_args[@]+${torch_args[@]}}" \
        "${requirements[@]}"; then
        die "Failed to install Python packages"
    fi

    success "Installed Python packages successfully"
}

verify_installation() {
    step "Verifying installation"

    if ! "${ENV_DIR}/bin/python" -c "import nodetool.worker" >/dev/null 2>&1; then
        die "The Python worker failed to import. Run: ${ENV_DIR}/bin/python -c 'import nodetool.worker'"
    fi
    success "The Python worker imports"
}

print_completion_message() {
    local python_path="${ENV_DIR}/bin/python"

    echo ""
    echo -e "${GREEN}${BOLD}NodeTool Python environment installed${NC}"
    echo ""
    echo -e "${BOLD}Environment:${NC} $ENV_DIR"
    echo ""
    echo "The NodeTool server is the Node.js CLI. It starts this environment's"
    echo "Python worker when a workflow uses a Python node. Point it at the"
    echo "environment with NODETOOL_PYTHON:"
    echo ""
    echo -e "    ${CYAN}NODETOOL_PYTHON=\"$python_path\" nodetool serve${NC}"
    echo ""
    echo "Without NODETOOL_PYTHON, the server finds the environment only at"
    echo "~/.local/share/nodetool/conda_env on Linux."
    echo ""
    echo -e "${BOLD}Documentation:${NC} https://github.com/nodetool-ai/nodetool"
    echo ""
}


# ==============================================================================
# Main
# ==============================================================================

show_help() {
    cat << EOF
NodeTool Python Environment Installer

Usage: $0 [OPTIONS]

Options:
    --prefix DIR    Installation directory (default: ~/.local/share/nodetool)
    --pack NAME     Also install a Python pack: huggingface or mlx (repeatable)
    -y, --yes       Non-interactive mode, skip confirmation prompts
    --help          Show this help message

Environment Variables:
    NODETOOL_HOME   Custom installation directory

Examples:
    # Install with defaults
    $0

    # Install to a custom location
    $0 --prefix /opt/nodetool

    # Install with the HuggingFace pack
    $0 --pack huggingface

    # Non-interactive installation
    $0 -y

    # One-liner installation
    curl -fsSL https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.sh | bash

EOF
}

main() {
    # Default values
    NOCONFIRM="false"
    NODETOOL_HOME="${NODETOOL_HOME:-$HOME/.local/share/nodetool}"
    PACKS=()
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --prefix)
                if [[ -n "${2:-}" ]]; then
                    NODETOOL_HOME="$2"
                    shift 2
                else
                    die "--prefix requires a directory argument"
                fi
                ;;
            --pack)
                if [[ -n "${2:-}" ]]; then
                    PACKS+=("$2")
                    shift 2
                else
                    die "--pack requires a pack name"
                fi
                ;;
            -y|--yes|--no-confirm)
                NOCONFIRM="true"
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                die "Unknown option: $1. Use --help for usage information."
                ;;
        esac
    done
    
    # Expand tilde if present
    NODETOOL_HOME="${NODETOOL_HOME/#\~/$HOME}"
    
    # Set up paths
    MICROMAMBA_DIR="${NODETOOL_HOME}/micromamba"
    ENV_DIR="${NODETOOL_HOME}/conda_env"
    
    # Show banner
    echo ""
    echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}${BOLD}║               NodeTool Python Environment Installer              ║${NC}"
    echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    info "Installation directory: $NODETOOL_HOME"
    echo ""
    
    # Confirm installation
    if [[ "$NOCONFIRM" != "true" ]]; then
        if ! confirm "Proceed with installation?"; then
            info "Installation cancelled by user"
            exit 0
        fi
    fi
    
    # Detect platform
    detect_platform
    
    # Check prerequisites
    check_prerequisites
    
    # Set up directories
    setup_directories
    
    # Download and install micromamba
    download_micromamba
    
    # Create conda environment
    create_conda_environment
    
    # Install Python packages
    install_python_packages
    
    # Verify installation
    verify_installation
    
    # Print completion message
    print_completion_message
    
    success "NodeTool installation complete!"
}

# Run main function
main "$@"
