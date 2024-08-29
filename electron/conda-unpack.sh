#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PYTHON_ENV_DIR="$SCRIPT_DIR/python"

if [ ! -f "$PYTHON_ENV_DIR/.conda_unpacked" ]; then
    echo "Unpacking conda environment..."
    source "$PYTHON_ENV_DIR/bin/activate"
    conda-unpack
    touch "$PYTHON_ENV_DIR/.conda_unpacked"
    echo "Conda environment unpacked successfully."
else
    echo "Conda environment already unpacked. Skipping."
fi
