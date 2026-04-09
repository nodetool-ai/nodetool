# Node Implementation Gap Report

## Systemic Issues

### S1: Audio nodes operate on raw bytes instead of decoded samples
Nearly every TS audio node treats audio as `Uint8Array` instead of decoded PCM samples.
Affected: OverlayAudio, RemoveSilence, Reverse, FadeIn, FadeOut, MonoToStereo, StereoToMono,
AudioMixer, SliceAudio, Trim, Normalize, CreateSilence, AudioToNumpy, NumpyToAudio, ConvertToArray.
Root cause: No pydub equivalent. Need ffmpeg-based or WAV-aware audio processing.

### S2: Video nodes with stub byte operations
Affected: FrameIterator, Concat, Trim, Reverse, ExtractFrame, FrameToVideo, AddAudio.
These concatenate/slice raw bytes instead of using ffmpeg.
Fps and GetVideoInfo return hardcoded values.

### S3: Video ffmpeg nodes with unused inputs
Affected: Denoise(strength), Stabilize(smoothing,crop_black), Sharpness(luma_amount,chroma_amount),
Overlay(overlay_audio_volume), ColorBalance(wrong filter), AddSubtitles(timestamps,font,color,align),
Transition(transition_type,offset), SetSpeed(extreme values).

### S4: Model3D nodes are all stubs
All mesh operations do byte arithmetic instead of real geometry.
Affected: Decimate, Boolean3D, Transform3D, RecalculateNormals, CenterMesh, FlipNormals,
MergeMeshes, FormatConverter, GetModel3DMetadata, TextTo3D, ImageTo3D.

### S5: Missing asset system integration
Nodes that read/write filesystem instead of context asset system:
LoadImageAssets, LoadAudioAssets, LoadVideoAssets, LoadTextAssets, LoadCSVAssets,
SaveAudio, SaveImage, SaveText, SaveVideo.

### S6: Missing SaveUpdate/LogUpdate events
File-saving nodes don't emit SaveUpdate. Execute* nodes don't emit LogUpdate.

### S7: Missing is_production() guards
All lib.os.* nodes (~25) allow unrestricted filesystem access.

## Critical Agent Gaps

### A1: ClaudeAgent (anthropic.ts)
- Missing MCP/control tool support
- Missing streaming output (never emits chunks despite declaring streaming)
- Missing use_claude_credentials (Claude Code subscription)
- Missing cwd (working directory)
- Missing stderr collection for error context
- Missing CLAUDECODE env var
- Missing is_cacheable=False

### A2: OpenAI RealtimeAgent (openai.ts)
- Tool/function-calling support completely missing
- Wrong default system prompt (short summary vs detailed 8-rule prompt)
- Wrong VAD: server_vad instead of semantic_vad
- No audio accumulation or final AudioRef emission
- No cancellation/turn-detected handling
- No multi-response pending counter
- Audio transcript deltas not streamed as chunks

### A3: OpenAI RealtimeTranscription (openai.ts)
- Listens for WRONG event: conversation.item.input_audio_transcription.completed
  instead of response.audio_transcript.delta
- Session modalities: text-only vs audio+text
- No segment aggregation logic
- No cancellation handling

### A4: Agent node (agents.ts)
- No parallel tool execution (Python uses asyncio.gather)
- No DB-backed thread persistence (uses in-memory map)
- No tool name normalization for tolerant matching
- No iteration limits (Python: max_iterations=32, max_control_tool_calls=16)
- Missing ToolCallUpdate/EdgeUpdate messages
- Missing response_format for structured output

### A5: Missing: ControlAgent, ResearchAgent (agents.ts)

## Generator Stubs

### G1: ChartGenerator - returns hardcoded bar chart, no LLM call
### G2: SVGGenerator - returns hardcoded placeholder SVG, no LLM call

## Image Processing Gaps

### I1: RenderText (lib-image-draw.ts) - ignores all inputs, hardcoded SVG
### I2: Canny (lib-image-filter.ts) - not real Canny, same as FindEdges/Contour
### I3: AutoContrast/Equalize/AdaptiveContrast all use sharp.normalize()
### I4: LiftGammaGain wrong operation order
### I5: FilmLook preset values all wrong
### I6: RankFilter ignores rank input
### I7: Expand reads wrong property name for fill
### I8: GaussianNoise wrong algorithm (uniform not Gaussian), ignores mean/stddev

## Text/Document Gaps

### T1: CountTokens uses naive regex instead of tiktoken
### T2: FormatText missing Jinja2 filter support
### T3: RegexSplit maxsplit implementation is incorrect
### T4: RegexValidate uses .test() instead of re.match() (anchored)
### T5: ExtractJSON JSONPath only supports basic paths
### T6: SplitDocument/SplitHTML/SplitJSON/SplitMarkdown - all naive char chunking
### T7: HtmlToText uses regex stripping instead of html2text library
### T8: LoadWordDocument extracts plain text, loses all formatting

## PDF Gaps

### P1: ExtractTables - naive heuristic vs pdfplumber/pymupdf
### P2: ExtractMarkdown - font-size heuristic vs pymupdf4llm
### P3: ExtractImages - entirely missing
### P4: ExtractTextWithStyle missing color field

## KIE API Gaps

### K1: 31 model ID mismatches (see full report)
### K2: All Suno nodes (6) hit wrong endpoint (/api/v1/generate instead of specific)
### K3: Veo31 nodes wrong endpoints and polling
### K4: Runway nodes wrong endpoints and download paths
### K5: Missing audio→MP3 and video→MP4 conversion before upload
### K6: 7 missing audio nodes (lyrics, stems, covers, etc.)

## Search Gaps

### SR1: 34 of 42 search nodes missing entirely
### SR2: All 8 existing nodes missing text output field

## Messaging Gaps

### M1: DiscordBotTrigger only validates token, doesn't listen
### M2: TelegramBotTrigger only validates token, doesn't poll
### M3: Gmail nodes are stubs (throw errors)

## API Integration Gaps

### API1: Gemini ImageGeneration uses :predict instead of :generateImages
### API2: Apify API key name mismatch (APIFY_API_TOKEN vs APIFY_API_KEY)
### API3: Supabase nodes don't declare url/key inputs (always undefined)

## Control/Trigger Gaps

### C1: If node missing streaming input handling
### C2: Collect emits intermediate results instead of final list
### C3: WaitNode uses setTimeout instead of suspend/resume
### C4: WebhookTrigger only parses JSON (missing form data)

## SVG/Misc Gaps

### SVG1: SVGToImage returns raw SVG instead of rasterizing to PNG
### MISC1: SpiderCrawl respect_robots_txt ignored
### MISC2: ShowNotification does nothing
### MISC3: ChartRenderer only 3 of 17+ plot types

## Missing Namespaces (144 nodes)

- nodetool.boolean.* (8 nodes)
- nodetool.list.* (22 nodes)
- nodetool.dictionary.* (20 nodes)
- nodetool.numbers.* (2 nodes)
- search.* 34 missing nodes
- lib.http.* (15 nodes)
- lib.date.* (15 nodes)
- lib.json.* (10 nodes)
- lib.math.* (10 nodes)
- lib.uuid.* (7 nodes)
- lib.ocr (1 node)

## Minor Gaps

- Missing is_cacheable=False on trigger/workspace nodes
- Missing refresh_uri() on constant nodes
- Missing _auto_save_asset on OpenAI/Gemini image nodes
- Output wrapping differences ({output:...} vs flat)
- DropNA treats empty string as NA
- Aggregate missing std/var functions
- ModulusArray JS % vs numpy mod for negatives
- SliceArray stop=0 opposite behavior
- DateTime constant wrong utc_offset conversion
- CompareImages does byte comparison instead of preview slider
- LoadImageFolder/LoadAudioFolder ignore include_subdirectories, extensions, pattern props
- SaveImageFile ignores overwrite prop
- TextToImage/ImageToImage missing provider params (guidance_scale, seed, etc.)
- Image GetMetadata wrong output schema
