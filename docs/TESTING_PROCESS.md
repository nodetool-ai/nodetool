---
layout: page
title: "Comprehensive Testing Process"
---


This document outlines the testing strategy for NodeTool, focusing on validating AI model integration across different variants, platforms, and backends.

## 1. Overview

The goal of this testing process is to ensure the reliability, performance, and correctness of NodeTool's AI capabilities. This includes verifying:

- **Model Variants**: StableDiffusionXL, Flux, QwenImage, QwenImageEdit, and others.
- **Inference Engines**: Ollama, MLX (Apple Silicon), Nunchaku (NVIDIA), and HuggingFace Diffusers.
- **Platforms**: macOS, Windows, and Linux.
- **Agent Integration**: Correct behavior of agents running via Ollama.

## 2. Test Matrix

We test the following combinations to ensure broad compatibility.

### 2.1. Models & Variants

| Model Family | Variants | Key Features to Test |
| :--- | :--- | :--- |
| **Stable Diffusion** | SDXL Base, SDXL Refiner, SD 1.5/2.1 | Text-to-Image, Image-to-Image, Inpainting, LoRA support |
| **Flux** | Flux.1-dev, Flux.1-schnell, Flux Fill, Flux Depth, Flux Redux | High-quality generation, Inpainting, Depth-guided generation |
| **Qwen Image** | Qwen-VL, Qwen2-VL | Visual Question Answering, Image Description |
| **Qwen Image Edit** | Qwen-Image-Edit | Instruction-based image editing |
| **Ollama Agents** | Llama 3, Mistral, Gemma, DeepSeek | Chat completion, Tool usage, JSON output |

### 2.2. Backends & Platforms

| Backend | Platform | Target Hardware | Notes |
| :--- | :--- | :--- | :--- |
| **MLX** | macOS | Apple Silicon (M1/M2/M3/M4) | Verify memory usage and optimization on unified memory. |
| **Nunchaku** | Windows, Linux | NVIDIA GPUs (RTX 3090/4090) | Test 4-bit quantization performance and visual fidelity. |
| **Diffusers** | Windows, Linux, macOS | CUDA, MPS, CPU | Standard full-precision or FP16 execution. |
| **Ollama** | All | CPU, GPU (CUDA, Metal, ROCm) | Verify server connectivity and model pulling. |

## 3. Manual Testing Procedures

### 3.1. Setup

1. **Environment**: Ensure `conda` is installed.
2. **Installation**: Run `python build.py env create --full` to set up the environment.
3. **Server Start**: Launch the application or run `python -m nodetool.cli serve`.

### 3.2. Model Verification Steps

#### StableDiffusionXL (SDXL)

1. **Load Node**: Add an `SDXL Text to Image` node.
2. **Configuration**: Select `stabilityai/stable-diffusion-xl-base-1.0`.
3. **Execution**: Generate an image with prompt "A futuristic city, 8k resolution".
4. **Validation**: Check for high-resolution output (1024x1024) and visual coherence.
5. **Refiner**: Connect the latent output to an `SDXL Refiner` node and verify improved details.

#### Flux (All Variants)

1. **Flux.1-dev**: Generate an image using `black-forest-labs/FLUX.1-dev`. Verify high adherence to prompt.
2. **Flux Fill**: Use an image with a masked area. Prompt to fill the mask. Verify seamless blending.
3. **Flux Depth**: Input a depth map or an image to extract depth. Generate a new image respecting the depth structure.
4. **Platform Check**:
    - **Mac**: Ensure `MLX` backend is selected/active. Monitor RAM usage.
    - **Win/Linux**: Ensure `Nunchaku` is used if available for 4-bit loading.

#### Qwen Image & Edit

1. **Qwen-VL**: Input an image and ask "What is in this image?". Verify accurate description.
2. **Qwen Image Edit**: Input an image of a cat. Prompt "Make the cat a tiger". Verify the subject changes while preserving composition.

#### Ollama Agents

1. **Connection**: Ensure Ollama is running (`ollama serve`).
2. **Agent Node**: Add an `Agent` node. Select provider `Ollama`.
3. **Model**: Choose `llama3`.
4. **Interaction**: Send a prompt "Write a python function to calculate fibonacci". Verify code output.
5. **Tool Use**: (If implemented) Ask the agent to perform a calculation or look up data.

## 4. Automated Testing Strategy

### 4.1. Unit Tests (Frontend & Electron)

* **Location**: `apps/src/__tests__` and `electron/src/__tests__`.
- **Command**: `npm test` in respective directories.
- **Scope**: UI components, state management, Electron IPC, and utility functions.

### 4.2. Backend Integration Tests (Proposed)

Since the backend is Python-based, we use `pytest` for integration testing.

- **Location**: `tests/integration` (to be created).
- **Structure**:

    ```
    tests/
    ├── integration/
    │   ├── test_sdxl.py
    │   ├── test_flux.py
    │   ├── test_qwen.py
    │   └── test_ollama.py
    └── conftest.py
    ```

* **Test Logic**:
    1. Initialize the specific model pipeline (using `diffusers`, `mlx`, or `nunchaku` APIs directly).
    2. Run a generation task with fixed seed.
    3. Assert output shape and type.
    4. (Optional) Compare image histogram or perceptual hash against a baseline.

### 4.3. End-to-End (E2E) Workflows

* **Tool**: Custom script or Playwright (for UI).
- **Scripted Workflow**:
    Create a Python script that uses the `nodetool` API to:
    1. Construct a workflow graph (JSON).
    2. Submit it to the execution engine.
    3. Poll for completion.
    4. Download and verify assets.

## 5. Platform-Specific Considerations

### Apple Silicon (Mac)

* **MLX Verification**: Ensure `mlx` package is installed.
- **Memory Pressure**: Run tests that max out memory (e.g., loading Flux.1-dev in fp16) to verify graceful failure or swapping behavior.

### Windows (NVIDIA)

* **CUDA Check**: Verify `torch.cuda.is_available()` returns True.
- **Nunchaku**: Verify `nunchaku` kernels load correctly.

### Linux

* **Headless Testing**: Run tests in a CI environment (e.g., GitHub Actions) using CPU offload or GPU runners if available.

## 6. Performance Benchmarking

Measure and record:

1. **Model Load Time**: Time from request to first inference.
2. **Inference Speed**: Iterations per second (it/s).
3. **Peak Memory**: VRAM and RAM usage.

Run these benchmarks weekly to detect regressions.
