---
layout: page
title: "Node Reference"
---

A node is one step in a NodeTool workflow. It takes inputs, does one job such as calling a model, resizing an image or branching on a condition, and passes the result to the next node. This reference is generated from the node registry. Each node page shows the node type, its properties with their types, descriptions and defaults, and its outputs.

The reference covers 502 nodes in 73 namespaces, grouped below by what you work with.

## Text and LLMs

Work with strings, structured text, embeddings and language models.

| Namespace | What it does | Nodes |
|---|---|---|
| [gemini.text](gemini/text/) | Gemini embeddings and search-grounded answers. | 2 |
| [huggingface](huggingface/) | Hugging Face inference tasks such as chat completion, classification, summarization and text to image. | 19 |
| [mistral.embeddings](mistral/embeddings/) | Mistral text embeddings. | 1 |
| [mistral.text](mistral/text/) | Mistral chat and code completion. | 2 |
| [nodetool.generators](nodetool/generators/) | Generate lists, data, charts, SVG and structured output with a language model. | 5 |
| [nodetool.text](nodetool/text/) | String editing, regex, JSON parsing, templates, splitting, token counting and embeddings. | 51 |
| [openai.text](openai/text/) | OpenAI embeddings, moderation and web search. | 3 |
| [transformers](transformers/) | Run Transformers models locally for classification, generation, summarization, translation, detection and speech. | 16 |
| [xai.text](xai/text/) | xAI chat completion and web search. | 2 |

## Images

Generate, edit, filter and composite images.

| Namespace | What it does | Nodes |
|---|---|---|
| [gemini.image](gemini/image/) | Gemini image generation. | 1 |
| [lib.grid](lib/grid/) | Slice an image into a grid of tiles. | 1 |
| [lib.image.channel](lib/image/channel/) | Merge and shuffle image channels. | 2 |
| [lib.image.color](lib/image/color/) | Brightness, contrast, exposure, hue, saturation, color grading and inversion. | 7 |
| [lib.image.draw](lib/image/draw/) | Generate gradients and checkerboard patterns. | 5 |
| [lib.image.effects](lib/image/effects/) | Blend modes, color overlay, drop shadow, glow and outline. | 5 |
| [lib.image.filter](lib/image/filter/) | Gaussian blur, pixelate, threshold, unsharp mask and vignette. | 5 |
| [lib.image.keyer](lib/image/keyer/) | Chroma key and luma key. | 2 |
| [lib.image.mask](lib/image/mask/) | Create, invert and apply masks. | 3 |
| [lib.image.warp](lib/image/warp/) | Affine, corner pin, displace, offset, pad and polar remap transforms. | 8 |
| [lib.stable_diffusion_cpp](lib/stable_diffusion_cpp/) | Generate images locally with stable-diffusion.cpp. | 1 |
| [lib.svg](lib/svg/) | Build SVG documents and convert SVG to an image. | 2 |
| [mistral.vision](mistral/vision/) | Mistral image to text and OCR. | 2 |
| [nodetool.compare](nodetool/compare/) | Compare two images. | 1 |
| [nodetool.image](nodetool/image/) | Load, save, resize, crop, composite and upscale images, plus text to image and image to image. | 26 |
| [nodetool.sketch](nodetool/sketch/) | Create, layer and render sketch documents. | 3 |
| [openai.image](openai/image/) | OpenAI image creation, editing and variations. | 3 |
| [reve](reve/) | Reve image creation, editing and remixing. | 3 |
| [xai.image](xai/image/) | xAI image generation. | 1 |
| [xai.vision](xai/vision/) | xAI image to text. | 1 |

## Video

Generate, edit and assemble video, timelines and scripts.

| Namespace | What it does | Nodes |
|---|---|---|
| [gemini.video](gemini/video/) | Gemini text to video and image to video. | 2 |
| [lib.video.download](lib/video/download/) | Download a video from YouTube. | 1 |
| [nodetool.creative](nodetool/creative/) | Storyboard helpers such as director, screenplay shots, shot batches and entity application. | 5 |
| [nodetool.script](nodetool/script/) | Load voiceover scripts and convert them to subtitles, timelines and voiced audio. | 4 |
| [nodetool.timeline](nodetool/timeline/) | Add clips to a timeline, render it and read its transcript. | 3 |
| [nodetool.video](nodetool/video/) | Load, trim, concatenate, filter and subtitle video, plus text to video, image to video and lip sync. | 33 |

## Audio

Generate, transform, mix and transcribe audio.

| Namespace | What it does | Nodes |
|---|---|---|
| [elevenlabs](elevenlabs/) | ElevenLabs text to speech, speech to text, realtime streaming and voice selection. | 5 |
| [gemini.audio](gemini/audio/) | Gemini text to speech and transcription. | 2 |
| [lib.audio](lib/audio/) | Audio effects such as reverb, delay, compressor, EQ filters, pitch shift and time stretch. | 16 |
| [nodetool.audio](nodetool/audio/) | Load, save, trim, mix, fade, normalize and convert audio, plus text to speech and text to music. | 24 |
| [nodetool.audio.realtime](nodetool/audio/realtime/) | Process audio as a live stream of chunks, with streaming filters and audio output. | 6 |
| [nodetool.audio.synth](nodetool/audio/synth/) | Modular synth parts such as oscillator, LFO, ADSR, gate and mixer. | 9 |
| [openai.audio](openai/audio/) | OpenAI text to speech, transcription and translation. | 3 |
| [whisper_cpp](whisper_cpp/) | Live transcription with whisper.cpp. | 1 |

## 3D

Generate and process 3D models and meshes.

| Namespace | What it does | Nodes |
|---|---|---|
| [nodetool.model3d](nodetool/model3d/) | Convert, repair, transform and render 3D models, plus text to 3D and image to 3D. | 18 |

## Data and documents

Constants, inputs, outputs, files, documents, PDFs, databases and vector search.

| Namespace | What it does | Nodes |
|---|---|---|
| [lib.charts](lib/charts/) | Render a chart from data. | 1 |
| [lib.pdf](lib/pdf/) | Extract text, tables and styled text from PDFs, run OCR, and render pages as images. | 7 |
| [lib.sqlite](lib/sqlite/) | Get the path of the workflow SQLite database. | 1 |
| [nodetool.constant](nodetool/constant/) | Fixed values of every type, including text, numbers, media, lists and model selections. | 31 |
| [nodetool.data](nodetool/data/) | Iterate over data frame rows and load CSV assets. | 2 |
| [nodetool.document](nodetool/document/) | List, load and save document files. | 3 |
| [nodetool.input](nodetool/input/) | Workflow inputs of every type, filled in when the workflow runs. | 34 |
| [nodetool.output](nodetool/output/) | Mark a value as a workflow output. | 1 |
| [nodetool.variable](nodetool/variable/) | Set and get workflow variables. | 2 |
| [vector](vector/) | Create vector collections, index text, images and embeddings, and run text, image and hybrid queries. | 14 |

## Control flow and logic

Branch, loop, trigger and reuse parts of a workflow.

| Namespace | What it does | Nodes |
|---|---|---|
| [nodetool.control](nodetool/control/) | Branching, loops, filtering, fallbacks, error handling and stream operators such as zip, take and collect. | 25 |
| [nodetool.triggers](nodetool/triggers/) | Start a workflow from a file change, interval, webhook or manual run. | 5 |
| [nodetool.workflows.app_node](nodetool/workflows/app_node/) | Embed a mini app in a workflow. | 1 |
| [nodetool.workflows.base_node](nodetool/workflows/base_node/) | Preview a value on the canvas. | 1 |
| [nodetool.workflows.subgraph](nodetool/workflows/subgraph/) | Group part of a workflow into a reusable subgraph. | 1 |
| [nodetool.workflows.workflow_node](nodetool/workflows/workflow_node/) | Run another workflow as a node. | 1 |

## Agents and tools

Agents that plan and call tools, plus code and browser automation.

| Namespace | What it does | Nodes |
|---|---|---|
| [lib.browser](lib/browser/) | Capture a screenshot of a web page. | 1 |
| [nodetool.agents](nodetool/agents/) | Agent, classifier, extractor, summarizer, decision and prompt enhancement nodes. | 7 |
| [nodetool.code](nodetool/code/) | Run JavaScript in the workflow sandbox. | 1 |
| [openai.agents](openai/agents/) | OpenAI live and realtime agents and realtime transcription. | 3 |

## Integrations and providers

Nodes for hosted model providers, local model runtimes and messaging services.

| Namespace | What it does | Nodes |
|---|---|---|
| [fal.dynamic](fal/dynamic/) | Run any FAL model by endpoint, with a schema-driven or raw request. | 2 |
| [kie.dynamic_schema](kie/dynamic_schema/) | Run Kie AI models through a schema-driven node. | 1 |
| [lib.comfy](lib/comfy/) | Run a ComfyUI workflow, locally or on a worker. | 2 |
| [messaging.discord](messaging/discord/) | Start a workflow from a Discord bot message. | 1 |
| [messaging.telegram](messaging/telegram/) | Start a workflow from a Telegram bot message. | 1 |
| [minimax](minimax/) | MiniMax text to image, text to video, image to video, text to speech, music and voice. | 6 |

## Games and testing

Game asset helpers and nodes used to test the workflow engine.

| Namespace | What it does | Nodes |
|---|---|---|
| [nodetool.fake](nodetool/fake/) | Stand-in nodes that return fake output for testing. | 2 |
| [nodetool.game](nodetool/game/) | Game assets such as sprite sheets, tilesets, sound effects and music loops. | 8 |
| [nodetool.test](nodetool/test/) | Nodes that exercise the workflow engine in tests, such as streaming, error and slow nodes. | 22 |

## Find a node

Press `/`, `Ctrl+K` or `⌘K` to search the site by node name. To add your own nodes, see the [custom nodes guide](../developer/custom-nodes-guide). For how nodes connect into workflows, see [key concepts](../key-concepts).
