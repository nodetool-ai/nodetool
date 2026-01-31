#!/usr/bin/env bash
#
# NodeTool CLI Installer
# ======================
#
# A portable, self-contained shell installer that bootstraps a complete
# NodeTool CLI environment using micromamba and installs nodetool-core and
# nodetool-base packages from the NodeTool registry.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.sh | bash
#   
#   # Or with options:
#   ./install.sh --prefix ~/.nodetool -y
#
# Environment Variables:
#   NODETOOL_HOME - Custom installation directory (default: ~/.nodetool)
#
# Options:
#   --prefix DIR    Installation directory (overrides NODETOOL_HOME)
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

NODETOOL_REGISTRY="https://nodetool-ai.github.io/nodetool-registry/simple/"
PYPI_INDEX="https://pypi.org/simple"

# Python packages to install from the registry
PYTHON_PACKAGES=(
    "nodetool-core"
    "nodetool-base"
)

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
    "nodejs>=20"
    "pip"
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
    mkdir -p "$NODETOOL_HOME/bin"
    mkdir -p "$NODETOOL_HOME/cache"
    
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
    
    # Remove from cleanup since it succeeded
    CLEANUP_DIRS=("${CLEANUP_DIRS[@]/$ENV_DIR}")
    
    success "Created conda environment with all dependencies"
}

install_python_packages() {
    step "Installing Python packages from NodeTool registry"
    
    local uv_path="${ENV_DIR}/bin/uv"
    
    if [[ ! -x "$uv_path" ]]; then
        die "uv not found in conda environment at $uv_path"
    fi
    
    info "Installing: ${PYTHON_PACKAGES[*]}"
    
    # Set up environment for uv
    # We use --python to specify the target Python interpreter directly
    # This avoids issues with virtual environment detection
    export PATH="$ENV_DIR/bin:$PATH"
    
    if ! "$uv_path" pip install \
        "${PYTHON_PACKAGES[@]}" \
        --python "${ENV_DIR}/bin/python" \
        --index-url "$NODETOOL_REGISTRY" \
        --extra-index-url "$PYPI_INDEX"; then
        die "Failed to install Python packages"
    fi
    
    success "Installed Python packages successfully"
}

create_wrapper_script() {
    step "Creating wrapper script"
    
    local wrapper_path="${NODETOOL_HOME}/bin/nodetool"
    
    cat > "$wrapper_path" << 'WRAPPER_SCRIPT'
#!/usr/bin/env bash
#
# NodeTool CLI wrapper script
# Auto-generated by the NodeTool installer
#

set -euo pipefail

# Determine the installation directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODETOOL_HOME="$(dirname "$SCRIPT_DIR")"

# Set up environment
export MAMBA_ROOT_PREFIX="${NODETOOL_HOME}/micromamba"
export PATH="${NODETOOL_HOME}/env/bin:${PATH}"

# Set cache directories for models
export HF_HOME="${HF_HOME:-${NODETOOL_HOME}/cache/huggingface}"
export OLLAMA_MODELS="${OLLAMA_MODELS:-${NODETOOL_HOME}/cache/ollama}"

# Invoke the nodetool CLI
exec "${NODETOOL_HOME}/env/bin/python" -m nodetool.cli "$@"
WRAPPER_SCRIPT

    chmod +x "$wrapper_path"
    
    success "Created wrapper script at $wrapper_path"
}

verify_installation() {
    step "Verifying installation"
    
    local wrapper_path="${NODETOOL_HOME}/bin/nodetool"
    
    # Check if wrapper exists and is executable
    if [[ ! -x "$wrapper_path" ]]; then
        die "Wrapper script not found or not executable"
    fi
    
    # Try to run nodetool --help
    info "Testing nodetool CLI..."
    if ! "$wrapper_path" --help >/dev/null 2>&1; then
        warn "nodetool --help failed, but installation may still be usable"
        warn "Try running: $wrapper_path --help"
    else
        success "nodetool CLI is working"
    fi
}

print_completion_message() {
    local bin_path="${NODETOOL_HOME}/bin"
    
    echo ""
    echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║                   NodeTool Installation Complete!                ║${NC}"
    echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BOLD}Installation directory:${NC} $NODETOOL_HOME"
    echo ""
    echo -e "${BOLD}To use nodetool, add it to your PATH:${NC}"
    echo ""
    echo -e "    ${CYAN}export PATH=\"$bin_path:\$PATH\"${NC}"
    echo ""
    echo -e "${BOLD}Or add this line to your shell configuration file:${NC}"
    echo ""
    
    # Detect the shell
    local shell_name
    shell_name=$(basename "${SHELL:-/bin/bash}")
    
    case "$shell_name" in
        zsh)
            echo -e "    ${CYAN}echo 'export PATH=\"$bin_path:\$PATH\"' >> ~/.zshrc${NC}"
            ;;
        bash)
            if [[ -f "$HOME/.bash_profile" ]]; then
                echo -e "    ${CYAN}echo 'export PATH=\"$bin_path:\$PATH\"' >> ~/.bash_profile${NC}"
            else
                echo -e "    ${CYAN}echo 'export PATH=\"$bin_path:\$PATH\"' >> ~/.bashrc${NC}"
            fi
            ;;
        fish)
            echo -e "    ${CYAN}fish_add_path $bin_path${NC}"
            ;;
        *)
            echo -e "    ${CYAN}echo 'export PATH=\"$bin_path:\$PATH\"' >> ~/.profile${NC}"
            ;;
    esac
    
    echo ""
    echo -e "${BOLD}Then start a new terminal or run:${NC}"
    echo ""
    echo -e "    ${CYAN}source ~/.${shell_name}rc${NC}  # or your shell's config file"
    echo ""
    echo -e "${BOLD}Quick start:${NC}"
    echo ""
    echo -e "    ${CYAN}nodetool --help${NC}              # Show available commands"
    echo -e "    ${CYAN}nodetool serve --port 7777${NC}   # Start the NodeTool server"
    echo -e "    ${CYAN}nodetool worker --host 0.0.0.0${NC} # Start a worker"
    echo ""
    echo -e "${BOLD}Documentation:${NC} https://github.com/nodetool-ai/nodetool"
    echo ""
}

add_to_path_interactive() {
    if [[ "$NOCONFIRM" == "true" ]]; then
        return 0
    fi
    
    local bin_path="${NODETOOL_HOME}/bin"
    local shell_name
    shell_name=$(basename "${SHELL:-/bin/bash}")
    
    local rc_file=""
    case "$shell_name" in
        zsh)
            rc_file="$HOME/.zshrc"
            ;;
        bash)
            if [[ -f "$HOME/.bash_profile" ]]; then
                rc_file="$HOME/.bash_profile"
            else
                rc_file="$HOME/.bashrc"
            fi
            ;;
        fish)
            # Fish uses a different mechanism
            echo ""
            return 0
            ;;
        *)
            rc_file="$HOME/.profile"
            ;;
    esac
    
    if [[ -n "$rc_file" ]]; then
        echo ""
        if confirm "Would you like to add nodetool to your PATH in $rc_file?"; then
            local export_line="export PATH=\"$bin_path:\$PATH\""
            
            # Check if it's already there
            if grep -qF "$bin_path" "$rc_file" 2>/dev/null; then
                info "PATH already configured in $rc_file"
            else
                echo "" >> "$rc_file"
                echo "# NodeTool CLI" >> "$rc_file"
                echo "$export_line" >> "$rc_file"
                success "Added nodetool to PATH in $rc_file"
                info "Please restart your terminal or run: source $rc_file"
            fi
        fi
    fi
}

# ==============================================================================
# Main
# ==============================================================================

show_help() {
    cat << EOF
NodeTool CLI Installer

Usage: $0 [OPTIONS]

Options:
    --prefix DIR    Installation directory (default: ~/.nodetool)
    -y, --yes       Non-interactive mode, skip confirmation prompts
    --help          Show this help message

Environment Variables:
    NODETOOL_HOME   Custom installation directory

Examples:
    # Install with defaults
    $0

    # Install to a custom location
    $0 --prefix /opt/nodetool

    # Non-interactive installation
    $0 -y

    # One-liner installation
    curl -fsSL https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.sh | bash

EOF
}

main() {
    # Default values
    NOCONFIRM="false"
    NODETOOL_HOME="${NODETOOL_HOME:-$HOME/.nodetool}"
    
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
    ENV_DIR="${NODETOOL_HOME}/env"
    
    # Show banner
    echo ""
    echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}${BOLD}║                     NodeTool CLI Installer                       ║${NC}"
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
    
    # Create wrapper script
    create_wrapper_script
    
    # Verify installation
    verify_installation
    
    # Print completion message
    print_completion_message
    
    # Offer to add to PATH
    add_to_path_interactive
    
    success "NodeTool installation complete!"
}

# Run main function
main "$@"
