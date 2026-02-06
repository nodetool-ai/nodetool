---
layout: page
title: "HuggingFace Integration"
description: "Guide to HuggingFace nodes in NodeTool."
---

# <img src="assets/icons/huggingface.svg" width="28" height="28" style="vertical-align: middle; display: inline-block;" alt="HuggingFace" /> HuggingFace Integration

The HuggingFace integration connects NodeTool to the HuggingFace Hub, providing nodes for text, image, audio, and multimodal processing. With support for over 25 different model types and access to 500,000+ pre-trained models, you can build AI workflows using the latest open-source models.

## Overview

HuggingFace nodes in NodeTool allow you to:

- **Access 500,000+ Models**: Use any model from the HuggingFace Hub
- **Multi-Modal Processing**: Work with text, images, audio, and video
- **Local & Cloud Execution**: Run models locally or use hosted services
- **Memory Optimization**: Support for quantization and CPU offload
- **Streaming Output**: Real-time generation for text and audio
- **LoRA Customization**: Apply custom style adaptations to Stable Diffusion

All HuggingFace nodes are available under the `huggingface.*` namespace with 27 sub-categories covering different AI capabilities.

## Node Categories

### 🎨 Image Generation

#### Text-to-Image Nodes

**Stable Diffusion** - Generate high-quality images from text prompts
- Custom width/height settings (256-1024px)
- Configurable inference steps and guidance scale
- Support for negative prompts
- Use cases: Art creation, concept visualization, content generation

**Stable Diffusion XL** - Enhanced image generation with SDXL models
- Higher resolution outputs (up to 1024px)
- Improved image quality and detail
- Support for IP adapters and LoRA models
- Use cases: Marketing materials, game assets, interior design concepts

**Qwen-Image** - High-quality general-purpose text-to-image generation
- Nunchaku quantization support for efficient memory usage
- True CFG scale control for precise guidance
- Supports MLX for Apple Silicon optimization
- Use cases: General-purpose image generation, quick prototyping, production workflows

**Flux** - Image generation with memory-efficient quantization
- Supports *schnell* (fast) and *dev* (high-quality) variants
- Nunchaku quantization (FP16, FP4, INT4) for reduced VRAM usage
- CPU offload support for large models
- Configurable max_sequence_length for prompt complexity
- Use cases: High-fidelity image generation with limited hardware

**Flux Control** - Controlled image generation with depth/canny guidance
- Depth-aware and edge-guided generation
- Control image input for structural guidance
- Quantization support (FP16, FP4, INT4)
- Use cases: Controlled composition, maintaining structure while changing style

**Chroma** - Flux-based model with advanced attention masking
- Professional-quality color control
- Attention slicing for memory optimization
- Use cases: Professional photography effects, precise color grading

**Qwen-Image** - High-quality general-purpose text-to-image generation
- Nunchaku quantization support
- True CFG scale control
- Use cases: General-purpose image generation, quick prototyping

**Text2Image (AutoPipeline)** - Automatic pipeline selection for any text-to-image model
- Auto-detects best pipeline for given model
- Flexible generation without pipeline-specific knowledge
- Use cases: Testing different models, rapid prototyping

#### Image-to-Image Transformation

**Image to Image** - Transform existing images using Stable Diffusion
- Strength parameter controls transformation amount
- Support for style transfer and image variations
- Use cases: Style transfer, image enhancement, creative remixing

### 🗣️ Speech & Audio Processing

#### Audio Classification

**Audio Classifier** - Classify audio into predefined categories
- Recommended models:
  - `MIT/ast-finetuned-audioset-10-10-0.4593`
  - `ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition`
- Use cases: Music genre classification, speech detection, environmental sounds, emotion recognition

**Zero-Shot Audio Classifier** - Classify audio without predefined categories
- Flexible classification with custom labels
- Use cases: Dynamic audio categorization, sound identification

#### Automatic Speech Recognition

**Whisper** - Convert speech to text with multilingual support
- Supports 100+ languages
- Translation mode (translate any language to English)
- Timestamp options (word-level or sentence-level)
- Multiple model sizes (tiny to large-v3)
- Recommended models:
  - `openai/whisper-large-v3` - Best accuracy
  - `openai/whisper-large-v3-turbo` - Fast inference
  - `openai/whisper-small` - Lightweight option
- Use cases: Transcription, translation, subtitle generation, voice interfaces

**ChunksToSRT** - Convert transcription chunks to SRT subtitle format
- Automatic timestamp formatting
- Time offset support
- Use cases: Video subtitling, accessibility features

#### Audio Generation

**Text-to-Speech** - Generate natural-sounding speech from text
- Multiple voice options
- Configurable speaking rate and pitch
- Use cases: Voiceovers, accessibility, content creation

**Text-to-Audio** - Generate audio effects and sounds from text descriptions
- Creative sound generation
- Use cases: Sound effects, audio design, music production

### 📝 Text Processing

#### Text Generation

**Text Generation** - Generate text using large language models
- Streaming output support
- Extensive model support including:
  - Qwen3 series (0.6B to 32B parameters)
  - Meta Llama 3.1 series
  - Ministral 3 series
  - Gemma 3 series
  - TinyLlama for lightweight deployment
- Quantized model support (BitsAndBytes 4-bit)
- Configurable parameters:
  - Temperature (0.0-2.0) - Controls randomness
  - Top-p (0.0-1.0) - Controls diversity
  - Max tokens (up to 512 default)
- GGUF model support for efficient inference
- Use cases: Chatbots, content generation, code completion, creative writing

#### Text Analysis

**Text Classification** - Classify text into categories
- Sentiment analysis
- Topic categorization
- Use cases: Content moderation, sentiment analysis, document organization

**Token Classification** - Identify and classify tokens in text
- Named entity recognition (NER)
- Part-of-speech tagging
- Use cases: Information extraction, text analysis

**Fill Mask** - Predict masked tokens in text
- BERT-style masked language modeling
- Use cases: Text completion, grammar correction

#### Question Answering

**Question Answering** - Extract answers from context
- Recommended models:
  - `distilbert-base-cased-distilled-squad`
  - `bert-large-uncased-whole-word-masking-finetuned-squad`
- Returns answer with confidence score and position
- Use cases: Document Q&A, customer support, information retrieval

**Table Question Answering** - Query tabular data with natural language
- Works with DataFrames
- Recommended models:
  - `google/tapas-base-finetuned-wtq`
  - `microsoft/tapex-large-finetuned-tabfact`
- Use cases: Database queries, spreadsheet analysis

#### Text Transformation

**Translation** - Translate text between languages
- Multiple language pairs
- Use cases: Localization, multilingual content

**Summarization** - Generate concise summaries of long text
- Extractive and abstractive summarization
- Use cases: Document summarization, news digests

### 🖼️ Image Analysis

#### Image Classification

**Image Classifier** - Classify images into predefined categories
- Recommended models:
  - `google/vit-base-patch16-224` - Vision Transformer
  - `microsoft/resnet-50` - ResNet architecture
  - `Falconsai/nsfw_image_detection` - Content moderation
  - `nateraw/vit-age-classifier` - Age estimation
- Returns confidence scores for each category
- Use cases: Content moderation, photo organization, age detection

**Zero-Shot Image Classifier** - Classify images without training data
- Uses CLIP models for flexible classification
- Custom candidate labels
- Recommended models:
  - `openai/clip-vit-base-patch32`
  - `laion/CLIP-ViT-H-14-laion2B-s32B-b79K`
- Use cases: Dynamic categorization, custom tagging

#### Image Understanding

**Image Segmentation** - Segment images into different regions
- Instance and semantic segmentation
- Use cases: Object isolation, background removal

**Object Detection** - Detect and locate objects in images
- Bounding box outputs
- Multi-object detection
- Use cases: Surveillance, counting, automation

**Depth Estimation** - Estimate depth from 2D images
- Monocular depth prediction
- Use cases: 3D reconstruction, AR/VR, robotics

### 🎭 Multimodal Processing

#### Video Generation

**Text-to-Video (CogVideoX)** - Generate videos from text prompts
- Large diffusion transformer model
- High-quality, consistent video generation
- Longer video sequences
- Use cases: Video content creation, animated storytelling, marketing videos, cinematic content

**Image-to-Video** - Convert static images into video sequences
- Animate still images
- Add motion to photographs
- Use cases: Photo animation, creating video from stills, dynamic presentations

#### Image-Text Models

**Image to Text** - Generate captions for images
- Automatic image captioning
- Use cases: Accessibility, content tagging, image search

**Image-Text-to-Text** - Process images with text queries
- Visual question answering
- Image reasoning with text context
- Use cases: Document understanding, visual Q&A, scene description

**Multimodal** - Process both image and text inputs
- Vision-language models
- Combined visual and textual understanding
- Use cases: Complex visual reasoning, document analysis, multimodal search

### 🎯 Model Customization

#### LoRA (Low-Rank Adaptation)

**LoRA Selector** - Apply LoRA models to Stable Diffusion
- Combine up to 5 LoRA models
- Adjustable strength per LoRA (0.0-2.0)
- 60+ pre-configured style LoRAs including:
  - Art styles (anime, pixel art, 3D render)
  - Character styles (Ghibli, Arcane, One Piece)
  - Visual effects (fire, lightning, water)
- Use cases: Style customization, character consistency, artistic effects

**LoRA Selector XL** - Apply LoRA models to Stable Diffusion XL
- SDXL-specific LoRA support
- Enhanced quality for high-resolution outputs
- Use cases: High-quality style transfer, professional artwork

### 🔧 Utility Nodes

**Feature Extraction** - Extract embeddings from text or images
- Generate vector representations
- Use cases: Semantic search, similarity matching, clustering

**Sentence Similarity** - Compute similarity between text pairs
- Use cases: Duplicate detection, semantic search

**Ranking** - Rank documents by relevance
- Use cases: Search engines, recommendation systems

## Installation & Setup

### Requirements

- Python 3.10+
- PyTorch 2.9.0+
- CUDA support recommended for optimal performance

HuggingFace nodes are included with NodeTool by default. No additional installation is required for basic usage.

### Model Downloads

Models are automatically downloaded from HuggingFace Hub on first use. Downloaded models are cached in `~/.cache/huggingface/` by default.

### Authentication

Some models require HuggingFace authentication:

1. Create a HuggingFace account at [https://huggingface.co](https://huggingface.co)
2. Generate an access token at [https://huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
3. Set your token in NodeTool:
   - **Desktop App**: Settings → Providers → HuggingFace Token
   - **Environment Variable**: `HF_TOKEN=your_token_here`

### Gated Models

Some models (like FLUX) require accepting terms on HuggingFace:
1. Visit the model page on HuggingFace Hub
2. Click "Agree and access repository"
3. Ensure your `HF_TOKEN` is set in NodeTool settings

## Usage Examples

### Example 1: Text Generation Workflow

Create a text generation workflow:

1. Add a **Text Generation** node from `huggingface.text_generation`
2. Configure the node:
   - Model: `Qwen/Qwen2.5-7B-Instruct`
   - Prompt: "Write a short story about a robot learning to paint"
   - Max tokens: 512
   - Temperature: 0.8
3. Connect to an output node
4. Run the workflow

### Example 2: Image Generation with Stable Diffusion

Generate images from text:

1. Add a **Stable Diffusion** node from `huggingface.text_to_image`
2. Configure the node:
   - Prompt: "A serene landscape with mountains and a lake at sunset, highly detailed"
   - Negative prompt: "blurry, low quality, distorted"
   - Width: 512, Height: 512
   - Inference steps: 50
   - Guidance scale: 7.5
3. Connect to an image output node
4. Run and view the generated image

### Example 3: Speech-to-Text Transcription

Transcribe audio files:

1. Add an **Audio Input** node with your audio file
2. Add a **Whisper** node from `huggingface.automatic_speech_recognition`
3. Configure Whisper:
   - Model: `openai/whisper-large-v3`
   - Task: Transcribe
   - Language: English
   - Timestamps: Word level
4. Connect audio input to Whisper node
5. Connect Whisper output to text output
6. Run to get transcription with timestamps

### Example 4: Image Classification

Classify images into categories:

1. Add an **Image Input** node with your image
2. Add an **Image Classifier** node from `huggingface.image_classification`
3. Configure classifier:
   - Model: `google/vit-base-patch16-224`
4. Connect image input to classifier
5. Connect classifier output to output node
6. Run to see classification results with confidence scores

### Example 5: Complete Workflow - Audio to Summary with Image

Build a multi-modal workflow:

1. **Audio Transcription**:
   - Audio Input → Whisper node
2. **Text Summarization**:
   - Whisper output → Text Generation node
   - Prompt: "Summarize the following text in 2-3 sentences: {transcription}"
3. **Image Generation**:
   - Summary output → Stable Diffusion node
   - Prompt: "Create an illustration for: {summary}"
4. **Outputs**:
   - Connect all outputs to appropriate output nodes

This workflow transcribes audio, generates a summary, and creates a matching image.

## Key Features

### Model Support

- **27+ Node Types**: Coverage of HuggingFace model capabilities
- **500,000+ Models**: Access to entire HuggingFace Hub
- **Automatic Pipeline**: Auto-selects best pipeline for each model
- **Custom Models**: Use any compatible HuggingFace model
- **Fine-tuned Models**: Support for custom fine-tuned models

### Performance & Optimization

- **Streaming Output**: Real-time generation for text and audio
- **Quantization**: Memory-efficient inference (FP16, FP4, INT4)
- **CPU Offload**: Run large models on limited hardware
- **GPU Acceleration**: Automatic CUDA/MPS detection
- **Batch Processing**: Process multiple inputs efficiently
- **Attention Optimization**: PyTorch 2 attention (automatic)

### Advanced Capabilities

- **LoRA Support**: Easy style customization for Stable Diffusion
- **Multimodal Processing**: Combine text, image, and audio
- **Zero-Shot Learning**: Classify without training data
- **Control Nets**: Structural guidance for image generation
- **Timestamp Support**: Word and sentence-level timestamps for ASR
- **Multiple Languages**: 100+ languages for speech recognition

### Developer-Friendly

- **Type Safety**: Full Pydantic type validation
- **Error Handling**: Clear error messages
- **Progress Tracking**: Real-time progress for long operations
- **Memory Management**: Automatic cleanup and optimization
- **Documentation**: Detailed docstrings for all nodes

## Performance Tips

### Memory Optimization

- Use quantized models (INT4, FP4) for reduced VRAM usage
- Enable CPU offload for large models in node properties
- Use smaller model variants when possible (e.g., whisper-small vs whisper-large)
- Enable attention slicing for memory-intensive operations
- Close other GPU applications when running large models

### Speed Optimization

- Use CUDA/GPU when available for best performance
- Select appropriate model sizes based on your needs:
  - Development: Use tiny/small/turbo variants
  - Production: Use large/optimized variants
- Use optimized models (e.g., whisper-large-v3-turbo vs whisper-large-v3)
- Enable PyTorch compilation for frequently-used models
- Pre-download models before production runs

### Quality vs Performance Trade-offs

- **Fast + Low Memory**: Quantized models with CPU offload
  - Example: FLUX Schnell with INT4 quantization
- **Balanced**: FP16 models on GPU with moderate inference steps
  - Example: Stable Diffusion with 30 steps
- **Best Quality**: Full precision models with high inference steps
  - Example: FLUX Dev with 50 steps

## Available Workflow Examples

The HuggingFace integration includes pre-built workflow examples:

- **Image to Image** - Transform images using Stable Diffusion
- **Movie Posters** - Generate movie poster-style images
- **Transcribe Audio** - Convert speech to text with Whisper
- **Pokemon Maker** - Generate Pokemon-style creatures
- **Depth Estimation** - Extract depth information from images
- **Add Subtitles To Video** - Automatically generate and add subtitles
- **Object Detection** - Detect and locate objects in images
- **Summarize Audio** - Transcribe and summarize audio content
- **Segmentation** - Segment images into regions
- **Audio To Spectrogram** - Visualize audio as spectrograms

These examples demonstrate best practices and can be customized for your needs.

## Troubleshooting

### Common Issues

**CUDA Out of Memory**
```
RuntimeError: CUDA out of memory
```
Solutions:
- Enable CPU offload in node advanced properties
- Use quantized models (INT4/FP4)
- Reduce image size or inference steps
- Close other GPU applications
- Use smaller model variants

**Model Not Found**
```
OSError: Model not found
```
Solutions:
- Ensure model name is correct (check HuggingFace Hub)
- Verify internet connection for model download
- Check `HF_TOKEN` is set for gated models
- Clear cache and retry: `rm -rf ~/.cache/huggingface/`

**Slow Inference**
Solutions:
- Verify CUDA is available: Check Settings → System Info
- Use smaller or quantized models
- Enable attention optimizations in node properties
- Consider using turbo/fast model variants
- Pre-compile models with torch.compile

**Authentication Errors**
```
HTTPError: 401 Client Error: Unauthorized
```
Solutions:
- Generate a new token at https://huggingface.co/settings/tokens
- Set token in Settings → Providers → HuggingFace Token
- Accept model terms on HuggingFace Hub for gated models
- Ensure token has appropriate permissions

**Import Errors**
```
ModuleNotFoundError: No module named 'transformers'
```
Solutions:
- Restart NodeTool to ensure dependencies are loaded
- Check Python environment has all required packages
- Reinstall NodeTool if issues persist

## Model Recommendations

### Text Generation
- **Best Quality**: `Qwen/Qwen2.5-32B-Instruct`
- **Balanced**: `meta-llama/Llama-3.1-8B-Instruct`
- **Fast/Lightweight**: `TinyLlama/TinyLlama-1.1B-Chat-v1.0`

### Image Generation
- **Best Quality**: FLUX Dev with 50 steps
- **Balanced**: Stable Diffusion XL with 30 steps
- **Fast**: FLUX Schnell with 4 steps

### Speech Recognition
- **Best Accuracy**: `openai/whisper-large-v3`
- **Fast**: `openai/whisper-large-v3-turbo`
- **Lightweight**: `openai/whisper-small`

### Image Classification
- **General Purpose**: `google/vit-base-patch16-224`
- **Content Moderation**: `Falconsai/nsfw_image_detection`
- **Zero-Shot**: `openai/clip-vit-base-patch32`

## Best Practices

1. **Start Small**: Test with smaller models before scaling up
2. **Monitor Resources**: Watch GPU memory and adjust settings
3. **Cache Models**: Pre-download models for production workflows
4. **Version Control**: Pin model versions for reproducibility
5. **Error Handling**: Add fallback logic for model failures
6. **Batch When Possible**: Process multiple items together for efficiency
7. **Use Previews**: Enable node previews to debug intermediate results
8. **Document Models**: Note which models work best for your use case

## Related Documentation

- [Models Guide](models.md) - Overview of all model types in NodeTool
- [Providers Guide](providers.md) - Provider configuration and usage
- [Nodes Reference](nodes/index.md) - Complete node documentation
- [Workflow Examples](/workflows/) - Pre-built workflow templates
- [Cookbook](cookbook.md) - Workflow patterns and recipes

## External Resources

- [HuggingFace Hub](https://huggingface.co/models) - Browse available models
- [HuggingFace Transformers](https://huggingface.co/docs/transformers) - Library documentation
- [Diffusers Documentation](https://huggingface.co/docs/diffusers) - Image generation library
- [HuggingFace Spaces](https://huggingface.co/spaces) - Interactive model demos

## Contributing

Found an issue or want to contribute? Visit the [NodeTool GitHub repository](https://github.com/nodetool-ai/nodetool) to report issues or submit pull requests.
