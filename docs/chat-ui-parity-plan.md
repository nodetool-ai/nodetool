---
layout: page
title: "OpenChatUI Parity Plan"
---

This plan captures basic, high-impact features from [OpenChatUI](https://github.com/openchatui/openchat) that we can implement or align with in NodeTool's chat experience. Sources: OpenChatUI README features list and the OpenChatUI docs introduction.

## Goals

- Identify core OpenChatUI chat features that map to NodeTool's Global Chat.
- Call out what we already support today.
- Prioritize a short list of incremental, user-facing improvements.

## Feature Snapshot (OpenChatUI → NodeTool)

| Feature | OpenChatUI | NodeTool Status | Notes |
| --- | --- | --- | --- |
| Multi-provider chat | ✅ | ✅ | OpenAI, Anthropic, Google, OpenRouter, local models supported. |
| Threads / multi-chat | ✅ | ✅ | Threaded chat with search and auto-naming. |
| Markdown + code highlighting | ✅ | ✅ | ReactMarkdown + syntax highlighting already in chat. |
| File uploads / rich content | ✅ | ✅ | Images, audio, docs supported; asset previews in chat. |
| Image generation | ✅ | ✅ | Image generation tools available in chat tools menu. |
| Video generation | ✅ | ⚠️ | Supported via workflows; no direct chat-first UI. |
| Voice chat / TTS | ✅ | ⚠️ | Text-to-speech tool exists; no push-to-talk / voice chat UI. |
| Drive / Docs integration | ✅ | ⚠️ | Collections + Chroma search; no Google Drive/Docs integration. |
| Chat organization (folders/tags/pins) | ✅ | ❌ | Not available yet. |
| Share/export conversations | ✅ | ❌ | Not available yet. |
| PDF/doc reading enhancements | ✅ | ⚠️ | Doc attachments supported; no dedicated reader/summary UI. |

## Plan (Checklist)

### ✅ Already supported (baseline parity)
- [x] Multi-provider chat (OpenAI, Anthropic, Google, local models)
- [x] Threaded conversations with search
- [x] Markdown rendering with code highlighting
- [x] File uploads (images, audio, docs)
- [x] Chat tools (web search, image generation, TTS)

### 🔜 Near-term improvements (basic + high-impact)
- [ ] Add conversation export (markdown/json)
- [ ] Add conversation sharing (public link or copy summary)
- [ ] Add pin/star for important threads
- [ ] Add lightweight folder/tag grouping for threads
- [ ] Add inline PDF/doc preview inside chat (beyond attachment list)

### 🧭 Medium-term alignment
- [ ] Add voice chat UI (push-to-talk + speech-to-text)
- [ ] Add per-thread model presets (defaults + overrides)
- [ ] Add chat-level generation parameter controls (temperature, max tokens)
- [ ] Add Drive/Docs connectors (Google Drive/Docs)
- [ ] Add dedicated “Chat Settings” panel (model visibility, defaults)

