FROM nvcr.io/nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04 AS base

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive\
    SHELL=/bin/bash\
    PYTHONPATH=/app\
    PATH="/root/.local/bin:$PATH"\
    LC_ALL=C.UTF-8\
    LANG=C.UTF-8\
    VIRTUAL_ENV=/app/venv

ENV PYTHONPATH="/app"

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
    libatlas-base-dev \
    libopenblas-dev \
    libopenblas-base \
    gfortran \
    libeigen3-dev \
    libgsl-dev \
    intel-mkl \

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
    libasound2-dev \
    portaudio19-dev \
    libopus-dev \
    libfdk-aac-dev \
    libx264-dev \
    libmp3lame-dev \
    libtheora-dev \
    libvpx-dev \
    libvorbis-dev \
    libavcodec-dev \
    libavformat-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    libpostproc-dev \
    libgstreamer1.0-dev \
    libgstreamer-plugins-base1.0-dev \

    # Data Processing and Storage
    libhdf5-dev \
    libhdf5-serial-dev \
    libboost-all-dev \
    libxml2-dev \
    libxslt1-dev \
    libsqlite3-dev \

    # Document Processing
    pandoc \
    texlive-xetex \
    tesseract-ocr \
    graphviz \

    # System Libraries
    libssl-dev \
    libffi-dev \
    liblzma-dev \
    libcairo2-dev \
    libgl1 \
    libgl1-mesa-glx \
    nvidia-cuda-toolkit && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    echo "en_US.UTF-8 UTF-8" > /etc/locale.gen

RUN pip3 install --upgrade pip

COPY requirements.txt /app/

RUN ln -s /usr/bin/python3 /usr/bin/python

# Create and activate virtual environment
RUN python -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN --mount=type=cache,target=/root/.cache pip install -r requirements.txt

RUN pip install ipython

COPY src /app
COPY scripts /app/scripts
