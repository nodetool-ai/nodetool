#!/usr/bin/env bash
# usage (on the pod, after pod-train.sh has made /root/venv): ./pod-setup-llama.sh
#
# Builds llama.cpp's llama-server and llama-quantize with CUDA on a
# runpod-torch image, at the commit every v3 evaluation used, and installs the
# converter's Python packages into the training venv. Prints SETUP-DONE.
#
# Two fixes the image needs. It ships no nvcc, so the CUDA 12.8 compiler comes
# from NVIDIA's apt repository. And the build fails on NCCL unless
# -DGGML_CUDA_NCCL=OFF is set.
#
# Env: LLAMA_CPP_DIR (/root/llama.cpp, on the container disk),
#      LLAMA_COMMIT (d3c3e242c16b8cbf51400fad410cd69b22d64f35),
#      CUDA_ARCH (default: the GPU's compute capability, such as 90 for an H100),
#      PY (/root/venv/bin/python)
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in -h | --help) usage; exit 0 ;; esac
dir=${LLAMA_CPP_DIR:-/root/llama.cpp}
commit=${LLAMA_COMMIT:-d3c3e242c16b8cbf51400fad410cd69b22d64f35}
arch=${CUDA_ARCH:-$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader | head -1 | tr -d '.')}
py=${PY:-/root/venv/bin/python}
export DEBIAN_FRONTEND=noninteractive

. /etc/os-release
repo=ubuntu${VERSION_ID//./}
cd /root
wget -q "https://developer.download.nvidia.com/compute/cuda/repos/$repo/x86_64/cuda-keyring_1.1-1_all.deb"
dpkg -i cuda-keyring_1.1-1_all.deb
apt-get update -q
apt-get install -y -q cuda-nvcc-12-8 cuda-cudart-dev-12-8 libcublas-dev-12-8 cuda-nvrtc-dev-12-8 cmake

[ -d "$dir" ] || git clone -q https://github.com/ggml-org/llama.cpp "$dir"
cd "$dir"
git checkout -q "$commit"
python3 -m uv pip install -q --python "$py" sentencepiece gguf==0.17.1
export PATH=/usr/local/cuda-12.8/bin:$PATH
cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES="$arch" -DLLAMA_CURL=OFF \
  -DGGML_CUDA_NCCL=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build build -j "$(nproc)" --target llama-server llama-quantize
ls -la build/bin/llama-server build/bin/llama-quantize
echo SETUP-DONE
