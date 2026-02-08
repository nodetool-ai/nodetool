---
layout: page
title: "ComfyUI Integration Watchlist (Last 6 Months)"
---

Collected from the ComfyUI changelog and blog posts published between **Aug 2025 – Jan 2026**. The table is **sorted by category** and lists 50 items that could inform NodeTool integrations or roadmap planning.

| Category | ComfyUI update (last 6 months) | Source | Why it fits NodeTool |
| --- | --- | --- | --- |
| API & Integrations | V3 API exposes DynamicCombo + Autogrow widgets (v0.8.0, 2026-01-07) | [Changelog v0.8.0](https://docs.comfy.org/changelog) | Mirror dynamic widget behaviors to simplify complex node configs. |
| API & Integrations | Kling Omni 720p + WAN2.6 ReferenceToVideo API nodes (v0.8.0) | [Changelog v0.8.0](https://docs.comfy.org/changelog) | Add equivalent video API nodes for parity with ComfyUI workflows. |
| API & Integrations | GPT-Image-1.5 API nodes (v0.5.1, 2025-12-18) | [Changelog v0.5.1](https://docs.comfy.org/changelog) | Expand NodeTool’s image generation providers. |
| API & Integrations | Kling Omni Image/TextToVideoWithAudio/ImageToVideoWithAudio nodes (v0.5.0) | [Changelog v0.5.0](https://docs.comfy.org/changelog) | Offer multimodal video nodes with audio integration. |
| API & Integrations | Tripo3.0 3D model generation node (v0.5.0) | [Changelog v0.5.0](https://docs.comfy.org/changelog) | Add 3D asset generation to NodeTool’s node catalog. |
| API & Integrations | Topaz video enhancement API nodes (v0.3.71, 2025-11-21) | [Changelog v0.3.71](https://docs.comfy.org/changelog) | Integrate video upscaling/enhancement workflows. |
| API & Integrations | Gemini Image API aspect_ratio support (v0.3.65, 2025-10-14) | [Changelog v0.3.65](https://docs.comfy.org/changelog) | Add aspect-ratio controls for image generation nodes. |
| API & Integrations | Sora2 API node (v0.3.64, 2025-10-08) | [Changelog v0.3.64](https://docs.comfy.org/changelog) | Add OpenAI video generation support in NodeTool. |
| API & Integrations | Seedance Video API node (v0.3.58, 2025-09-06) | [Changelog v0.3.58](https://docs.comfy.org/changelog) | Provide high-fidelity video generation options. |
| Audio & Video | Seedance 1.5 Pro audio-visual co-generation | [Blog Jan 21 2026](https://blog.comfy.org/p/seedance-1-5-pro-now-in-comfyui) | Enable synced video + dialogue/music generation workflows. |
| Audio & Video | Vidu Q2 video model (consistency + camera control) | [Blog Jan 22 2026](https://blog.comfy.org/p/vidu-q2-now-live-in-comfyui) | Add consistent-character video generation to NodeTool. |
| Audio & Video | WAN 2.6 Reference-to-Video | [Blog Jan 16 2026](https://blog.comfy.org/p/wan26-reference-to-video) | Provide reference-image driven video pipelines. |
| Audio & Video | Kling 2.6 Motion Control | [Blog Jan 13 2026](https://blog.comfy.org/p/kling-26-motion-control) | Add motion-control nodes for video workflows. |
| Audio & Video | Preprocessor + frame interpolation workflows | [Blog Jan 14 2026](https://blog.comfy.org/p/preprocessor-and-frame-interpolation) | Package as reusable video pre-processing templates. |
| Audio & Video | Wan2.2 S2V workflow enhancements + audio sync fixes (v0.3.55) | [Changelog v0.3.55](https://docs.comfy.org/changelog) | Add audio-to-video extensions and sync safeguards. |
| Audio & Video | Native audio recording node + audio-video dependency integration (v0.3.51) | [Changelog v0.3.51](https://docs.comfy.org/changelog) | Enable quick audio capture inside NodeTool workflows. |
| Developer & Workflow APIs | Unified jobs API (/api/jobs) for workflow monitoring (v0.6.0) | [Changelog v0.6.0](https://docs.comfy.org/changelog) | Align NodeTool’s job monitoring endpoints and UI. |
| Developer & Workflow APIs | ComfyAPI core v0.0.2 + partial execution support (v0.3.48) | [Changelog v0.3.48](https://docs.comfy.org/changelog) | Add partial-run execution to debug or iterate workflows. |
| Developer & Workflow APIs | Network Client V2 upgrade with async cancellation (v0.3.67) | [Changelog v0.3.67](https://docs.comfy.org/changelog) | Support cancelable API calls in NodeTool’s clients. |
| Developer & Workflow APIs | Custom node published subgraphs endpoint (v0.3.67) | [Changelog v0.3.67](https://docs.comfy.org/changelog) | Add subgraph publishing in NodeTool’s node library. |
| Developer & Workflow APIs | V3 schema migration for core node categories (v0.3.65) | [Changelog v0.3.65](https://docs.comfy.org/changelog) | Keep NodeTool node schemas aligned with modern metadata. |
| Developer & Workflow APIs | Interrupt handler prompt_id parameter (v0.3.57) | [Changelog v0.3.57](https://docs.comfy.org/changelog) | Allow targeted cancellation of running prompts. |
| Hardware & Performance | LTXAV text encoder device selection + reduced VRAM (v0.8.1) | [Changelog v0.8.1](https://docs.comfy.org/changelog) | Optimize text encoder placement for low-VRAM workflows. |
| Hardware & Performance | FP8MM offloading performance fix (v0.8.1) | [Changelog v0.8.1](https://docs.comfy.org/changelog) | Apply similar offload fixes for FP8 model paths. |
| Hardware & Performance | Sage Attention 3 support via CLI (v0.8.0) | [Changelog v0.8.0](https://docs.comfy.org/changelog) | Expose advanced attention backends for performance. |
| Hardware & Performance | Async memory offload default for AMD GPUs (v0.7.0) | [Changelog v0.7.0](https://docs.comfy.org/changelog) | Improve AMD GPU reliability for local workflows. |
| Hardware & Performance | Temporal rolling VAE VRAM reductions (v0.4.0) | [Changelog v0.4.0](https://docs.comfy.org/changelog) | Reduce VRAM usage for long video runs. |
| Hardware & Performance | Pinned memory enabled by default (v0.3.69) | [Changelog v0.3.69](https://docs.comfy.org/changelog) | Speed up CPU↔GPU transfers in NodeTool. |
| Hardware & Performance | Mixed Precision Quantization + RAM Pressure Cache Mode (v0.3.68) | [Changelog v0.3.68](https://docs.comfy.org/changelog) | Add low-RAM fallback modes for local execution. |
| Model Support | Grok Imagine model integration | [Blog Jan 29 2026](https://blog.comfy.org/p/grok-imagine-now-available-in-comfyui) | Add xAI image generation to NodeTool providers. |
| Model Support | Z-Image Day-0 support | [Blog Jan 27 2026](https://blog.comfy.org/p/z-image-day-0-support-in-comfyui) | Add Z-Image nodes for high-quality image generation. |
| Model Support | Meshy 6 3D model generation | [Blog Jan 20 2026](https://blog.comfy.org/p/meshy-6-now-available-in-comfyui) | Support 3D asset generation workflows. |
| Model Support | Bria FIBO Edit (commercial-safe editing) | [Blog Jan 20 2026](https://blog.comfy.org/p/introducing-bria-fibo-edit-precision-image) | Add licensed-safe editing model to NodeTool. |
| Model Support | FLUX.2 Klein 4B/9B | [Blog Jan 15 2026](https://blog.comfy.org/p/flux2-klein-4b-fast-local-image-editing) | Offer lightweight local image editing models. |
| Model Support | LTXV2 model support (v0.8.0) | [Changelog v0.8.0](https://docs.comfy.org/changelog) | Expand NodeTool’s video model coverage. |
| Model Support | Gemma 12B support (v0.8.1) | [Changelog v0.8.1](https://docs.comfy.org/changelog) | Add lightweight LLM option for local agents. |
| Model Support | Qwen Image Layered support (v0.6.0) | [Changelog v0.6.0](https://docs.comfy.org/changelog) | Add Qwen image generation variants. |
| Model Support | WanMove motion model (v0.5.0) | [Changelog v0.5.0](https://docs.comfy.org/changelog) | Provide motion-specific model nodes. |
| Model Support | Flux2 model support + API nodes (v0.3.72) | [Changelog v0.3.72](https://docs.comfy.org/changelog) | Keep Flux2 workflows compatible with ComfyUI parity. |
| Security & Safety | Upscaler-4K malicious node pack post mortem | [Blog Jan 11 2026](https://blog.comfy.org/p/upscaler-4k-malicious-node-pack-post) | Implement node registry scanning + warning UX. |
| Security & Safety | CSP headers for public API (v0.3.72) | [Changelog v0.3.72](https://docs.comfy.org/changelog) | Harden NodeTool’s API surface against XSS. |
| UI/UX | Nodes 2.0 public beta (v0.3.76) | [Changelog v0.3.76](https://docs.comfy.org/changelog) | Modernize node visuals/layout patterns in NodeTool. |
| UI/UX | Linear mode beta navigation (v0.3.76) | [Changelog v0.3.76](https://docs.comfy.org/changelog) | Offer an alternate linear workflow view. |
| UI/UX | New workflow progress panel + Assets sidebar (v0.3.76) | [Changelog v0.3.76](https://docs.comfy.org/changelog) | Improve execution visibility and asset management UI. |
| UI/UX | Subgraph widget editing from Parameters panel (v0.3.66) | [Changelog v0.3.66](https://docs.comfy.org/changelog) | Allow quick subgraph edits without opening subflows. |
| UI/UX | Template modal redesign with filters (v0.3.66) | [Changelog v0.3.66](https://docs.comfy.org/changelog) | Enhance template browsing + filtering in NodeTool. |
| Workflow Nodes & Utilities | ManualSigmas node for sampling control (v0.7.0) | [Changelog v0.7.0](https://docs.comfy.org/changelog) | Add fine-grained sampling control in NodeTool. |
| Workflow Nodes & Utilities | ScaleROPE node for Flux/WAN models (v0.3.68) | [Changelog v0.3.68](https://docs.comfy.org/changelog) | Provide RoPE scaling utilities for diffusion models. |
| Workflow Nodes & Utilities | Epsilon Scaling node (v0.3.63) | [Changelog v0.3.63](https://docs.comfy.org/changelog) | Offer exposure-bias control for diffusion workflows. |
| Workflow Nodes & Utilities | ImageScaleToMaxDimension node (v0.3.57) | [Changelog v0.3.57](https://docs.comfy.org/changelog) | Add an image pre-scaling helper node. |
