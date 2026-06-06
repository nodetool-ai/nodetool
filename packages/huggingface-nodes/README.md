# @nodetool-ai/huggingface-nodes

Workflow nodes for the [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers/tasks/index)
API — one node per documented task modality.

All nodes call the unified router at `https://router.huggingface.co` and need a
Hugging Face access token with the **Inference Providers** permission, stored as
the `HF_TOKEN` secret (Settings → API Keys).

## Tasks

| Modality | Node | `nodeType` |
| --- | --- | --- |
| Text | Chat Completion | `huggingface.ChatCompletion` |
| Text | Text Generation | `huggingface.TextGeneration` |
| Text | Summarization | `huggingface.Summarization` |
| Text | Translation | `huggingface.Translation` |
| Text | Fill Mask | `huggingface.FillMask` |
| Text | Question Answering | `huggingface.QuestionAnswering` |
| Text | Table Question Answering | `huggingface.TableQuestionAnswering` |
| Text | Feature Extraction (embeddings) | `huggingface.FeatureExtraction` |
| Text | Text Classification | `huggingface.TextClassification` |
| Text | Token Classification (NER) | `huggingface.TokenClassification` |
| Text | Zero Shot Classification | `huggingface.ZeroShotClassification` |
| Image | Text to Image | `huggingface.TextToImage` |
| Image | Image to Image | `huggingface.ImageToImage` |
| Image | Image Classification | `huggingface.ImageClassification` |
| Image | Image Segmentation | `huggingface.ImageSegmentation` |
| Image | Object Detection | `huggingface.ObjectDetection` |
| Audio | Automatic Speech Recognition | `huggingface.AutomaticSpeechRecognition` |
| Audio | Audio Classification | `huggingface.AudioClassification` |
| Video | Text to Video | `huggingface.TextToVideo` |

## Usage

```ts
import { registerHuggingFaceNodes } from "@nodetool-ai/huggingface-nodes";

registerHuggingFaceNodes(registry);
```

Each node exposes a `model` field defaulting to a recommended model for the task;
any warm model on the Hub for that pipeline can be used by entering its repo id.
