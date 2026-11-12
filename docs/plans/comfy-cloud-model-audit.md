# Comfy Cloud model audit against ComfyUI partner nodes

This audit compares every model in `COMFY_ROUTER_CATALOG`
(`packages/runtime/src/providers/comfy-router-catalog.ts`) with the ComfyUI
partner nodes that call the same model. It checks the tasks each model is
listed for, where each media input goes in the request body, the parameter
ranges, and the checks a node runs before it submits.

## Sources

| Source | Revision |
|---|---|
| ComfyUI `comfy_api_nodes/nodes_*.py` and `apis/*.py` | `comfyanonymous/ComfyUI@74eb0c4b8a1a894e7210326882a8d9a016e37ccb` (2026-11-11) |
| Comfy workflow templates `templates/api_*.json` | `Comfy-Org/workflow_templates@a8bc07a76478dfada740fa8fa49ac87be1bff519` |
| Router input schemas | The seven saved in `packages/runtime/tests/fixtures/comfy-router-schemas/` |

Most ComfyUI partner nodes call the vendor through `/proxy/<vendor>/...`, so
their request body is the vendor's own shape. Only the Wan, Qwen and
WaveSpeed nodes call the Router (`/v2/models/{id}/requests`), the same route
NodeTool uses. Where the Router schema is not saved, a row compares the
ComfyUI vendor body with what NodeTool's schema-driven builder would send if
the Router mirrors that body, and says so.

The live Router listing and schemas need `COMFY_API_KEY`, and the audit
container could not reach `api.comfy.org`. To repeat the audit, save a schema
snapshot with a key, compare its `--schemas` output with the catalog, and
check the ComfyUI files named below at a newer commit:

```bash
COMFY_API_KEY=... node scripts/generate-comfy-router-catalog.mjs
COMFY_API_KEY=... node scripts/generate-comfy-router-manifest.mjs --check
```

## Status values

| Status | Meaning |
|---|---|
| Fixed | NodeTool sent a body the model does not expect. This change fixes it, with a request-body test. |
| Matches | Tasks, media placement and parameters agree with the ComfyUI node and the saved Router schema. |
| Tasks match | Tasks agree. The body could not be compared because the Router schema is not saved. |
| Decided | ComfyUI and the Router schema, or the catalog generated from it, disagreed. NodeTool now follows the ComfyUI node. See [Decisions](#decisions). |
| No node | No ComfyUI partner node calls this model. |
| Chat | Chat model. Its body comes from `chatRequest`, not the media builder, and was not compared. |

## Fixes in this change

| Code | Fix | Test |
|---|---|---|
| A1 | Seedance 2.x/1.x and MiniMax H3: the end frame is appended to `content[]` as `{type: "image_url", image_url: {url}, role: "last_frame"}`, as `ByteDance2FirstLastFrameNode`, `ByteDanceFirstLastFrameNode` and `MinimaxHailuo03FirstLastFrameNode` send it. Before, the provider looked for a named end-frame field and refused with "takes no end frame". | `Seedance 2.5: the end frame as a last_frame content part…`, `MiniMax H3: the end frame as a last_frame content part…` |
| A2 | Seedance 2.5 with a first frame sends `ratio: "adaptive"`. The Router schema refuses a concrete ratio in that mode with a 400, and `ByteDance2FirstLastFrameNode` forces `adaptive`. | same Seedance 2.5 test |
| A3 | Seedance 1.0 pro fast refuses an end frame. No ComfyUI first-last-frame node offers it. | `Seedance 1.0 pro fast: refuses an end frame…` |
| A4 | Seedance 2.x and MiniMax H3 take reference-to-video: `reference_image` and `reference_audio` content parts after the prompt, as `ByteDance2ReferenceNodeV2` and `MinimaxHailuo03ReferenceNode` send them. A reference video is refused, because the Router takes it only as a public URL or asset id. The catalog lists `reference_to_video` for these five models. | `Seedance 2.x references: …` (three tests), catalog test |
| A5 | Veo 3.1: the end frame goes in `instances[0].lastFrame`, as `Veo3FirstLastFrameNode` sends it and the Router schema declares it. | `Veo: the end frame as lastFrame in the instance…` |
| A6 | Wan 2.7 i2v, Wan 3.0 and Wan 3.0 prime: the end frame is a `{type: "last_frame", url}` media item. HappyHorse i2v still refuses one, since both sources say first frame only. | `Wan 2.7: …`, `Wan 3.0: …` |
| A7 | FLUX 3 video: the end frame is a second keyframe. `Flux3ImageToVideoNode` spreads its keyframes over the clip, so two keyframes are the first and last frame. | `FLUX 3 video: the end frame as a second keyframe…` |
| A8 | Qwen Image 3.0 and 3.0 pro list `image_to_image`. Their Router modalities include image, and the Qwen Image 3 Edit node sends images to the same Router id in `input.messages[0].content`. | `Qwen image edit: images then the prompt…` |
| A9 | Duration and resolution limits a shared schema states only in prose: Veo 3.1 takes 4, 6 or 8 seconds (the manifest had read the Veo 2 range 5-8), Seedance 2.5 4-30, 2.0 family 4-15, 1.5 pro 4-12, 1.0 3-12, Seedance 2.0 fast and mini 480p/720p, Seedance 1.x up to 1080p. | `comfy-router-constraints.test.ts` |
| A10 | Inputs that were dropped without an error now fail: reference images, videos or audio in reference-to-video with no field to take them, extra images sent to a single-image field or to Veo, reference images in video-to-video, and TTS reference audio. | `referenceToVideo refuses…`, `imageToImage refuses extra images…`, `videoToVideo and textToSpeech refuse…`, `Veo: refuses a second start image…` |
| A11 (D1) | Kling v3, v2.6, v2.5 Turbo and 3.0 Turbo list image-to-video. v3 and v2.5 Turbo send the start frame as raw base64 in `image` and the end frame in `image_tail`, with no aspect ratio, as `KlingFirstLastFrameNode` and `KlingStartEndFrameNode` send them. `mode` comes from the resolution on v3 (720p `std`, 1080p `pro`, 4k `4k`) and is `pro` on v2.6 and v2.5 Turbo. v2.6 and 3.0 Turbo refuse an end frame. 3.0 Turbo sends `contents: [{type: "prompt"}, {type: "first_frame", url}]`, as `execute_kling_turbo` does. v2.6 and v2.5 Turbo take 5 or 10 s. | `Kling v3: …`, `Kling 2.6: …`, `Kling 3.0 Turbo: …` |
| A12 (D6) | Kling v3 omni and video o1: frames in `image_list` typed `first_frame` and `end_frame`, references untyped and at most 7, as `KlingOmniProFirstLastFrameNode` and `OmniProReferences2VideoNode` send them. Both list reference-to-video. | `Kling omni: …` (two tests) |
| A13 (D4) | Seedance 1.x: resolution, ratio, duration and seed go after the prompt as `--flags`, followed by `--camerafixed false --watermark false`, and leave the top level. A lone first frame has no role. A prompt that already carries one of these flags is refused, as `raise_if_text_params` does. | `Seedance 1.x: …` (two tests) |
| A14 (D2, D5) | Seedance 2.0 and 2.5 accept 480p to 4k. No Seedance model accepts `9:21`. Veo 3.1 lite refuses 4k with ComfyUI's error. | `Seedance 2.0 keeps 1080p and 4k…`, `Veo 3.1 lite: refuses 4k…` |
| A15 (D7) | Gemini Omni 1.1 flash and Omni flash preview are also video models with text-to-video, image-to-video (one or two frames), reference-to-video (up to 14 images and 3 videos) and video-to-video (edit). The body is `GeminiVideoOmniV2`'s: media parts, videos then images, before the text part, `generation_config.video_config.task`, and `response_format` with `type: "video"`, the resolution (with `delivery: "uri"` at 1080p and 4k) and the aspect ratio. | `Gemini Omni video: …` |
| A16 (D8) | Luma Ray 3.2: output settings under `video`, frames as `video.start_frame` and `video.end_frame`, image-anchored clips always 5 s, and video-to-video as `type: "video_edit"` with the source in `source` and `edit.auto_controls`, as the LumaRay32 nodes send them. Media goes in the `data` and `media_type` fields of ComfyUI's `Luma2ImageRef`, because NodeTool cannot upload to get a URL. | `Ray 3.2: …` |
| A17 (D9) | Image-to-video for FLUX 3 Max (`image_url`, `end_image_url`), H3 Max and H3 Max Turbo (same fields), and LTX 2.5 fast and pro (`image_uri`, `last_frame_uri`). Reference-to-video for H3 Max (`reference_image_urls`, `reference_audio_urls`) and for Grok video and video 1.5 (`reference_images` as `{url}`, at most 7). H3 Max takes 5-15 s. | `H3 Max: …`, `LTX 2.5: …`, `FLUX 3 Max: …`, `Grok references: …` |
| A18 (D10) | Image-to-image for Grok Image (`images` as `{url}`, at most 3, 1 for -pro, a custom ratio on grok-imagine-image only with several images), Luma Photon (`modify_image_ref` with weight 0.9 by default, at most 0.98) and Krea 2, large, medium and medium turbo (`image_style_references`, strength 1, at most 10). | `Grok image edit: …`, `Luma Photon: …`, `Krea 2: …` |
| A19 (D11) | `bfl/flux-pro-1.0-fill` (needs a mask) and `kling/videos-avatar-image2video` (needs a driving audio) are no longer listed. | catalog test |

## Model table

| Our id | ComfyUI node(s) | Status | Notes |
|---|---|---|---|
| anthropic/* (12 ids) | `nodes_anthropic.py` | Chat | |
| beeble/switchx | `BeebleSwitchXVideoEditNode` | Tasks match | v2v. The preset sends `source_uri` and `reference_image_uri` as data URIs. ComfyUI also has an image edit mode the catalog does not list. |
| bfl/flux-2-max, bfl/flux-2-pro | `Flux2ImageNode` | Tasks match | t2i and i2i. |
| bfl/flux-3-image | `Flux3ImageNode` | Matches | Router schema saved. Resolution spelling covered by an existing test. |
| bfl/flux-3-video | `Flux3TextToVideoNode`, `Flux3ImageToVideoNode`, `Flux3VideoContinuationNode` | Fixed (A7) | Keyframes are sent as raw base64. ComfyUI sends URLs. Continuation (extend) is not listed: not listed, see D9. |
| bfl/flux-kontext-max, bfl/flux-kontext-pro | `nodes_bfl.py` | Tasks match | |
| bfl/flux-pro-1.0-expand | `FluxProExpandNode` | Tasks match | ComfyUI sends `top/bottom/left/right` pixel counts. NodeTool's image-to-image carries none, so the Router defaults apply. |
| bfl/flux-pro-1.0-fill | `FluxProFillNode` | Decided (D11, A19) | The node requires a mask, which NodeTool's image-to-image does not carry. No longer listed. |
| bfl/flux-pro-1.1, bfl/flux-pro-1.1-ultra | `FluxProUltraImageNode`, `nodes_bfl.py` | Tasks match | |
| bfl/video-edit-v1, bfl/video-upscale-v1 | `FluxVideoEditNode`, `FluxVideoUpscaleNodeV2` | Tasks match | |
| bfl/vto-v1 | `FluxVTONode` | Tasks match | Preset sends `person` and `garment` as base64, as the node names them. |
| bria/fibo, bria/image | `nodes_bria.py` (FIBO 2.0 Generate, FIBO 2.0 Edit) | Tasks match | |
| bria/image-edit-* (9 ids) | `nodes_bria.py` (Add Object, Erase Foreground, Expand, Increase Resolution, Remove Background, Guided Remove Background, Replace Background, Replace Object, Restore Photo) | Tasks match | The Bria nodes call Bria endpoints by operation name, not by these ids. |
| bria/video-edit-* (3 ids) | `nodes_bria.py` (Video Green Screen, Remove Video Background, Video Replace Background) | Tasks match | |
| byteplus/dreamina-seedance-2-5-260628 | `ByteDance2TextToVideoNode`, `ByteDance2FirstLastFrameNode`, `ByteDance2ReferenceNodeV2`, `ByteDance2DraftToFinalVideoNode` | Fixed (A1, A2, A4, A9) | Draft and draft-to-final are not listed. |
| byteplus/dreamina-seedance-2-0-260128 | same | Fixed (A1, A4, A9), Decided (D2, A14) | |
| byteplus/dreamina-seedance-2-0-fast-260128, byteplus/dreamina-seedance-2-0-mini | same | Fixed (A1, A4, A9) | |
| byteplus/seedance-1-5-pro-251215, byteplus/seedance-1-0-pro-250528 | `ByteDanceTextToVideoNode`, `ByteDanceImageToVideoNode`, `ByteDanceFirstLastFrameNode` | Fixed (A1, A9), Decided (D3, D4, D5: A13, A14) | |
| byteplus/seedance-1-0-pro-fast-251015 | `ByteDanceTextToVideoNode`, `ByteDanceImageToVideoNode` | Fixed (A3, A9), Decided (D3, D4, D5: A13, A14) | |
| byteplus/seed-2-0-* (3 ids) | `nodes_bytedance_llm.py` | Chat | |
| byteplus/seed-audio-1.0, byteplus/seed-audio-1.0-multilingual | `ByteDanceSeedAudio` | Tasks match | |
| byteplus/seedream-4-0-250828 … seedream-5-0-pro-260628 (5 ids) | `ByteDanceSeedreamNodeV3` | Tasks match | ComfyUI caps reference images at 14 for 5.0 lite and 10 otherwise. NodeTool does not check the count. |
| elevenlabs/eleven_multilingual_v2, eleven_v3, eleven_v4, eleven_v4_turbo | `ElevenLabsTextToSpeech`, `ElevenLabsTextToDialogue` | Matches (v4), Tasks match (others) | v4 schema saved. |
| elevenlabs/eleven_sfx_v2 | `ElevenLabsTextToSoundEffects` | Tasks match | |
| fal/crystal-upscaler, fal/crystal-video-upscaler | Clarity AI Crystal Upscale and Video Upscale | Tasks match | |
| fal/fal-gpt-image-2*, fal/fal-nano-banana-* (5 ids) | none | No node | |
| fal/fal-seedance-2.0, fal/fal-seedance-2.5 | none | No node | |
| fal/flux-3-max | `Flux3MaxTextToVideoNode`, `Flux3MaxImageToVideoNode` | Decided (D9, A17) | Image-to-video with `image_url` and `end_image_url`. More than two keyframes go to a keyframes route NodeTool's task cannot express. |
| fal/h3-max, fal/h3-max-turbo | MiniMax H3 Max nodes in `nodes_minimax.py` | Decided (D9, A17) | Image-to-video with `image_url` and `end_image_url` for both, reference-to-video for h3-max only. Reference videos are refused, because the node uploads them. 5-15 s. |
| fal/patina | `nodes_patina.py` | Tasks match | |
| freepik/ai-image-upscaler-precision-v2, freepik/ai-skin-enhancer-* (4 ids) | Magnific Image Upscale (Precise V2), Magnific Image Skin Enhancer | Tasks match | |
| gemini-interactions/gemini-omni-1.1-flash, gemini-omni-flash-preview | `GeminiVideoOmniV2`, `GeminiImage2` | Decided (D7, A15) | Listed as image and video models. The clip's length comes from the prompt, as the node says. |
| heygen/starfish | HeyGen Voice 1.0 Text to Speech | Tasks match | |
| higgsfield/higgsfield-genjutsu-motion-transfer-v1.0 | `nodes_higgsfield.py` | Tasks match | |
| higgsfield/higgsfield-kling-3-*, higgsfield-seedance-*, higgsfield-wan-3 (7 ids) | none | No node | |
| ideogram/ideogram-4-5 | Ideogram 4.5 Text to Image, Edit, Precise Edit | Tasks match | |
| ideogram/ideogram-v3 | Ideogram V3 | Tasks match (D10) | The node edits only with an image and a mask, which image-to-image does not carry. |
| ideogram/ideogram-v4, ideogram/p-image-ideogram | Ideogram V4, Ideogram & Pruna P-Image | Tasks match | |
| kling/kling-v3, kling/kling-v2-6, kling/kling-v2-5-turbo, kling/kling-3.0-turbo | `KlingVideoNode`, `KlingFirstLastFrameNode`, `KlingImage2VideoNode`, `KlingStartEndFrameNode`, 2.6 with-audio nodes | Decided (D1, A11) | Image-to-video for all four. First-last-frame for v3 and v2.5 Turbo. |
| kling/kling-v3-omni, kling/kling-video-o1 | `KlingOmniPro*` nodes | Decided (D6, A12) | Typed frames and untyped references in `image_list`. Reference videos are refused, because the node uploads them. |
| kling/kling-image-o1 | `KlingOmniProImageNode` | Tasks match | |
| kling/videos-avatar-image2video | `KlingAvatarNode` | Decided (D11, A19) | The node requires a driving audio (`sound_file`), which image-to-video does not carry. No longer listed. |
| kling/videos-lip-sync | Kling Lip Sync with Audio, with Text | Tasks match | NodeTool's video-to-video sends the prompt, which fits only the text variant. |
| krea/krea-2 | Krea 2 Image, Krea 2 Style Reference | Decided (D10, A18) | ComfyUI uploads style references to Krea assets first. NodeTool sends them as data URIs. |
| krea/krea-2-large, krea-2-medium, krea-2-medium-turbo | Krea 2 Image (Large, Medium, Medium Turbo) | Decided (D10, A18) | Same style references as krea-2. |
| krea/krea-3 | Krea 3 Image | Tasks match | |
| ltx/ltx-2-5-fast, ltx/ltx-2-5-pro | `Ltx25TextToVideoNode`, `Ltx25ImageToVideoNode`, `Ltx25AudioToVideoNode` | Decided (D9, A17) | Image-to-video with `image_uri` and `last_frame_uri`. Audio-to-video is not listed. |
| luma_2/ray-3.2 | `LumaRay32*` nodes | Decided (D8, D9, A16) | Text-to-video, image-to-video with start and end frames, and edit. Keyframes, reframe and extend are not listed: they need more than two frames, or a source by URL or generation id. |
| luma_2/uni-1, luma_2/uni-1-max | Luma UNI-1 Image, UNI-1 Image Edit | Tasks match | The manifest gives these image models video resolutions and durations from the shared schema. They are announced in the picker. |
| luma/photon-1, luma/photon-flash-1 | `LumaImageNode`, `LumaImageModifyNode` | Decided (D10, A18) | |
| minimax/minimax-h3 | MiniMax H3 Text to Video, First-Last-Frame, Reference | Fixed (A1, A4) | |
| moonvalley/* (3 ids) | none | No node | |
| openai/gpt-* chat (14 ids), openai/o3 | `nodes_openai.py` | Chat | |
| openai/gpt-image-1.5, gpt-image-2, gpt-image-2.5-flare, gpt-image-2.5-sunburst | OpenAI GPT Image, GPT Image 2 | Tasks match | |
| openrouter/chat-completions | `nodes_openrouter.py` | Chat | |
| pika/pika-2.5-*, pika-gpt-image-2, pika-nano-banana-*, pika-seedance-2.0 (6 ids) | none | No node | ComfyUI's Pika nodes call Pika H3 Flex, which the catalog does not list. |
| pruna/p-video-2 | Pruna P-Video-2 Text to Video, Image to Video | Tasks match | |
| qwen/qwen-image-3.0, qwen/qwen-image-3.0-pro | Qwen Image 3 Text to Image, Edit | Fixed (A8) | Router schema saved. ComfyUI allows at most 3 images. |
| recraft/recraftv2 | none | No node | |
| recraft/recraftv3, recraftv4* (15 ids) | Recraft V3 and V4 Text to Image and Text to Vector | Tasks match | |
| runware/* (7 ids) | none | No node | |
| runway/aleph2 | Runway Aleph2 Video to Video | Tasks match | |
| runway/gen4_image | `RunwayTextToImageNode` | Tasks match | |
| runway/gen4_turbo | `RunwayImageToVideoNodeGen4`, `RunwayFirstLastFrameNode` | Tasks match | |
| veed/* (4 ids) | VEED Remove Video Background, VEED Clean Audio (in Video) | Tasks match | |
| veo/veo-3.1-generate-001, veo-3.1-fast-generate-001 | `Veo3VideoGenerationNode`, `Veo3FirstLastFrameNode` | Fixed (A5, A9) | Router schema saved. |
| veo/veo-3.1-lite-generate-001 | same | Fixed (A5, A9), Decided (D5, A14) | |
| vertexai/gemini-* chat (5 ids) | `nodes_gemini.py` | Chat | |
| vertexai/gemini-2.5-flash-image, gemini-3-pro-image, gemini-3.1-flash-image, gemini-3.1-flash-lite-image, gemini-nano-banana-2.1 | Nano Banana, Nano Banana Pro, Nano Banana 2, Nano Banana 2.1 | Tasks match | |
| wan/wan2.7-i2v | Wan 2.7 Image to Video | Fixed (A6) | Router schema saved. The node also takes `driving_audio` and `first_clip`, which NodeTool's image-to-video does not carry. |
| wan/wan3.0-video, wan/wan3.0-video-prime | Wan 3.0 Image to Video, Wan 3.0 Reference to Video | Fixed (A6) | |
| wan/wan2.7-t2v, wan2.7-r2v, wan2.5-*, wan2.6-*, happyhorse-* (13 ids) | Wan and HappyHorse nodes (Router route) | Matches | Same shared Router schema as the saved Wan 2.7 one. HappyHorse i2v takes a first frame only, and NodeTool refuses an end frame for it. |
| wavespeed/flashvsr, seedvr2, ultimate-image-upscaler | FlashVSR Video Upscale, WaveSpeed Image Upscale (Router route) | Tasks match | |
| wavespeed/wavespeed-* (7 ids) | none | No node | |
| xai/grok-imagine-image, -2.0, -pro, -quality | Grok Image, Grok Image Edit | Decided (D10, A18) | ComfyUI notes that `-pro` and `-quality` are retired by xAI and now run as `-2.0`. |
| xai/grok-imagine-video, -1.5, -1.5-lite | Grok Video, Video Edit, Reference-to-Video, Video Extend | Decided (D9, A17) | Reference-to-video for video and 1.5. Edit and extend take the source video only as an uploaded URL, so they are not listed. |
| xai/grok-imagine-video-1.5-preview | none | No node | |

## Decisions

Each item was a disagreement between ComfyUI and the Router schema, or the
catalog generated from it. The ComfyUI node code was chosen as the
source of truth, so NodeTool now sends what the node sends.

- **D1 Kling image-to-video.** Added, A11.
- **D2 Seedance 2.0 at 1080p and 4k.** Kept, as ComfyUI offers them. A14.
- **D3 Seedance 1.0 minimum duration.** 3 s, ComfyUI's minimum. Unchanged from A9.
- **D4 Seedance 1.x parameters.** Sent as `--flags` in the prompt, A13.
- **D5 Small range differences.** `9:21` dropped for Seedance and 4k refused on Veo 3.1 lite, A14.
- **D6 Kling omni frames.** Typed `image_list` items, A12.
- **D7 Gemini Omni as a video model.** Added, A15.
- **D8 Luma Ray 3.2 frames.** `video.start_frame` and `video.end_frame`, A16.
- **D9 Modes the catalog lacked.** Added where the input can go inline, A17 and A16. Not added: Grok video edit and extend, FLUX 3 video extend, and Ray 3.2 reframe and extend. Their ComfyUI nodes send the source video only as an uploaded URL or a prior generation id, and NodeTool has no upload route.
- **D10 Image editing the catalog lacked.** Added for Grok Image, Luma Photon and Krea 2, A18. Not added for Ideogram V3: `IdeogramV3` edits only with both an image and a mask, and NodeTool's image-to-image carries no mask.
- **D11 Inputs NodeTool's task cannot carry.** Both models removed, A19.

## Models and modes ComfyUI has that the catalog lacks

The catalog holds only models the Router listed when it was generated, so
some of these may not be on the Router. Check the live listing.

- Video: Kling 4.0 and 4.0 flash, Kling motion control, try-on and audio lip sync, Seedance 2.5 Draft, vCube video enhance, MiniMax H3 Max recast, extend, reframe, insert, lip sync and camera control, Vidu (Q3, Q4, 2), PixVerse V6, Pika H3 Flex, LTX AlphaGen, SDR to HDR, reframe and upscale, Gemini Omni 1.2 flash, Topaz and HitPaw video enhance, sync.so lip sync, HeyGen avatar video.
- Image: Seedream 5.5, GPT Image 2.6 (with GIF and SVG), Seedream layer separation, Tencent HY Image, Meta Muse Image, Reve, Magnific creative upscale, style transfer and relight, Ideogram vector, Quiver SVG, Recraft vectorize and inpaint.
- Audio: Fish Audio, Breeze voices, Mirelo and Sonilo music and sound, Pika audio, ElevenLabs speech-to-speech and voice isolation.
- 3D: Tripo, Meshy, Rodin and Hunyuan3D. The Router catalog has no 3D task.
