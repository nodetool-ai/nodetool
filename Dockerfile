FROM nvcr.io/nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04 AS base

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive\
    SHELL=/bin/bash\
    PYTHONPATH=/app\
    PATH="/root/.local/bin:$PATH"\
    LC_ALL=C.UTF-8\
    LANG=C.UTF-8\
    VIRTUAL_ENV=/app/venv

RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
    # Python and build essentials
    python3-dev \
    python3-venv \
    python3-setuptools \
    python3-wheel \
    python3-distutils \
    python3-doc \
    python3-tk \
    python3-pip \
    build-essential \
    gcc \
    g++ \
    git \
    wget \
    curl \
    software-properties-common \
    # Scientific Computing Libraries
    libblas-dev \
    liblapack-dev \
    libopenblas-dev \
    # Image Processing
    libopencv-dev \
    libjpeg-dev \
    libpng-dev \
    libtiff-dev \
    libwebp-dev \
    libgif-dev \
    libsm6 \
    libxext6 \
    libxrender-dev \
    # Audio and Video Processing
    ffmpeg \
    libsndfile1 \
    libsndfile1-dev \
    libopus-dev \
    libx264-dev \
    libmp3lame-dev \
    libvorbis-dev \
    # Data Processing and Storage
    libxml2-dev \
    libxslt1-dev \
    libsqlite3-dev \
    # Document Processing
    tesseract-ocr \
    # System Libraries
    libssl-dev \
    libffi-dev \
    liblzma-dev \
    libcairo2-dev \
    libgl1 \
    libgl1-mesa-glx && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    echo "en_US.UTF-8 UTF-8" > /etc/locale.gen

RUN pip3 install --upgrade pip

COPY poetry.lock /app/poetry.lock
COPY pyproject.toml /app/pyproject.toml

RUN ln -s /usr/bin/python3 /usr/bin/python

# Create and activate virtual environment
RUN python -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN pip install git+https://github.com/nodetool-ai/nodetool-core
RUN pip install git+https://github.com/nodetool-ai/nodetool-base
RUN pip install git+https://github.com/nodetool-ai/nodetool-aime
RUN pip install git+https://github.com/nodetool-ai/nodetool-anthropic
RUN pip install git+https://github.com/nodetool-ai/nodetool-chroma
RUN pip install git+https://github.com/nodetool-ai/nodetool-comfy --extra-index-url https://download.pytorch.org/whl/cu121
RUN pip install git+https://github.com/nodetool-ai/nodetool-elevenlabs
RUN pip install git+https://github.com/nodetool-ai/nodetool-fal
RUN pip install git+https://github.com/nodetool-ai/nodetool-google
RUN pip install git+https://github.com/nodetool-ai/nodetool-huggingface --extra-index-url https://download.pytorch.org/whl/cu121
RUN pip install git+https://github.com/nodetool-ai/nodetool-lib-audio
RUN pip install git+https://github.com/nodetool-ai/nodetool-lib-data
RUN pip install git+https://github.com/nodetool-ai/nodetool-lib-image
RUN pip install git+https://github.com/nodetool-ai/nodetool-lib-ml
RUN pip install git+https://github.com/nodetool-ai/nodetool-lib-network
RUN pip install git+https://github.com/nodetool-ai/nodetool-ollama
RUN pip install git+https://github.com/nodetool-ai/nodetool-openai
RUN pip install git+https://github.com/nodetool-ai/nodetool-replicate

COPY src /app
COPY scripts /app/scripts
