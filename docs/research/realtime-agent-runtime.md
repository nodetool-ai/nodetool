# Realtime agent runtime: source inspection and current integration options

This research supports the [virtual-agent implementation plan](../plans/realtime-virtual-agents.md). The question is which semantics NodeTool must own to build a modular runtime without depending on Pipecat.

## Evidence boundary

The GitHub releases API identified Pipecat **v1.15.0** as the latest stable release during this pass. Its annotated tag resolves to commit `fda1d5e0cde9625c8dcef7b653ed731c2ce63672`. Source links below pin that commit rather than moving `main`. [Release](https://github.com/pipecat-ai/pipecat/releases/tag/v1.15.0)

Inspection covered frame scheduling, frame types, output transport, TTS, LLM tools, context aggregation, Flows management, eager turn handling, its speculation gate, local Smart Turn, and selected processor/Flows tests. Tests were read, not executed. No latency, provider quality, or deployment benchmark is claimed. Provider documentation is current evidence, not a promise that every installed SDK or model supports the same features.

## Findings from Pipecat code

| Finding | Observed implementation | Implication for NodeTool |
| --- | --- | --- |
| F8. Priority and cancellation are separate properties | `FrameProcessorQueue` orders initialization before system frames, then ordinary frames, preserving order within a tier. `_start_interruption` preserves uninterruptible work while cancelling interruptible processing. | Use a priority control path and explicit cancellation policy. Do not put interrupt/close behind buffered audio. |
| F9. Terminal events must survive interruption | `EndFrame` is ordered and uninterruptible. `CancelFrame` stops immediately. `FunctionCallResultFrame` preserves a produced result. | Distinguish graceful drain, response interruption, and forced session shutdown. Preserve committed tool outcomes without replaying their speech. |
| F10. Audio output has its own lifecycle | The output transport resets interruptible audio and timed queues, preserves ongoing mixer output, and handles video cancellation separately. | Speech, background sound, video, and timed UI cues cannot share one undifferentiated clear operation. |
| F11. Provider audio identity matters | The interruptible WebSocket TTS implementation reconnects when cancelled audio cannot be distinguished by context ID. It also tracks synthesis started before playback begins. | An epoch tag applied after receiving unidentified audio is insufficient. Close/reopen such a provider connection or reject it for overlapping synthesis. |
| F12. Tool cancellation has a settlement race | `_cancel_function_call_tasks` marks calls settled before awaiting cancellation, preventing a handler's late result from reopening the call. | Settle once, then abort. Separate a tool's durable outcome from whether it should trigger a spoken reply. |
| F13. A transition is coordinated with tool results | Flows stores a pending transition, installs an `on_context_updated` callback, and waits until the assistant aggregator has no in-progress calls. | Validate and serialize state transitions against a state revision. Do not switch the prompt/tool set while its prerequisite results are still unresolved. |
| F14. Eager inference has a commit gate | Eager turn handling withdraws on resumed speech, transcript mismatch, or timeout. `SpeculationGate.process` holds downstream output until turn confirmation and preserves terminal events on discard. | Defer speculation initially. Later, keep draft context/output separate and block effectful tools until the turn is committed. |
| F15. Local endpoint detection includes preprocessing | Local Smart Turn v3 uses ONNX, resamples to 16 kHz, and truncates/pads an eight-second window before feature extraction. | A TypeScript integration requires numerical fixture parity, worker isolation, model licensing checks, and measured CPU cost. Copying the model file alone is insufficient. |

Pinned implementation references:

- [Frame scheduler and interruption](https://github.com/pipecat-ai/pipecat/blob/fda1d5e0cde9625c8dcef7b653ed731c2ce63672/src/pipecat/processors/frame_processor.py#L140), [frame contracts](https://github.com/pipecat-ai/pipecat/blob/fda1d5e0cde9625c8dcef7b653ed731c2ce63672/src/pipecat/frames/frames.py).
- [Output transport](https://github.com/pipecat-ai/pipecat/blob/fda1d5e0cde9625c8dcef7b653ed731c2ce63672/src/pipecat/transports/base_output.py#L609), [TTS interruption](https://github.com/pipecat-ai/pipecat/blob/fda1d5e0cde9625c8dcef7b653ed731c2ce63672/src/pipecat/services/tts_service.py#L2524).
- [Tool settlement](https://github.com/pipecat-ai/pipecat/blob/fda1d5e0cde9625c8dcef7b653ed731c2ce63672/src/pipecat/services/llm_service.py#L2323), [Flows transition coordination](https://github.com/pipecat-ai/pipecat/blob/fda1d5e0cde9625c8dcef7b653ed731c2ce63672/src/pipecat/flows/manager.py#L545).
- [Eager turn strategy](https://github.com/pipecat-ai/pipecat/blob/fda1d5e0cde9625c8dcef7b653ed731c2ce63672/src/pipecat/turns/user_stop/eager_user_turn_stop_strategy.py), [speculation gate](https://github.com/pipecat-ai/pipecat/blob/fda1d5e0cde9625c8dcef7b653ed731c2ce63672/src/pipecat/turns/speculation_gate.py#L160).
- [Local Smart Turn](https://github.com/pipecat-ai/pipecat/blob/fda1d5e0cde9625c8dcef7b653ed731c2ce63672/src/pipecat/audio/turn/smart_turn/local_smart_turn_v3.py).

Two tests make useful acceptance scenarios. `test_terminal_frames_survive_interruption` checks that a queued end frame reaches the sink during interruption. `test_advertised_handlers_register_with_node_call_options` checks that Flows passes cancellation and timeout settings to registered tools, including defaults that differ from the underlying LLM service. These support requiring explicit policies rather than inheriting framework defaults. [Processor tests](https://github.com/pipecat-ai/pipecat/blob/fda1d5e0cde9625c8dcef7b653ed731c2ce63672/tests/test_frame_processor.py#L455), [Flows tests](https://github.com/pipecat-ai/pipecat/blob/fda1d5e0cde9625c8dcef7b653ed731c2ce63672/tests/test_flows_manager.py#L322)

The reusable ideas are ordering, identities, cancellation scopes, and explicit commit points. NodeTool does not need Pipecat's full frame taxonomy, Python class hierarchy, or generalized multi-agent infrastructure to implement the initial guide.

## Broader research and adapter shortlist

| Component | Current primary-source evidence | Plan consequence |
| --- | --- | --- |
| LiveKit transport only | Node `AudioSource` provides `captureFrame`, `clearQueue`, and `waitForPlayout`. In the linked source revision, queue duration and the wait are tracked using local time and a timer. | Suitable transport candidate. A drained sender queue is not an acknowledgment from the listener's device. |
| LiveKit Agents | Its realtime capabilities distinguish context/tool/instruction updates, transcript synchronization, and message truncation. Adaptive interruption handling distinguishes acknowledgments from genuine interruptions, with deployment and model restrictions. | Use a capability matrix. Do not assume Node/Python feature parity or that transport-only adoption includes these agent features. |
| Deepgram Flux | Provides committed end-of-turn events and optional eager/resumed events. Its guide recommends committed turns as the simpler starting point. | Evaluate provider-owned endpointing as an alternative to local VAD plus a separate turn model. Select one authoritative endpointing policy per profile. |
| Cartesia streaming TTS | Context cancellation only halts requests that have not started generating, according to the inspected docs. Context and flush IDs associate output with synthesis input. | Always discard stale output locally. Provider cancel and synthesis flush are different from clearing playback. |
| Gemini Live | Context compression, connection rotation, resumption handles, and GoAway handling are separate lifecycle features. | Future duplex adapters must own provider reconnect logic while the NodeTool visitor session retains its identity and policy. |
| LiveAvatar LITE | Accepts externally produced audio while leaving STT, model, and TTS orchestration to the caller. Events include interrupt, audio-buffer clearing, and utterance commitment. | A video-only provider fits the proposed architecture without replacing NodeTool's dialogue engine. |
| Browser audio processing | Capture constraints expose echo cancellation, noise suppression, and automatic gain control independently of the chosen application transport. | WebRTC is not the sole source of echo cancellation. Check supported constraints, actual track settings, and venue acoustics. |

Sources: [LiveKit AudioSource](https://docs.livekit.io/reference/client-sdk-node/classes/AudioSource.html), [pinned AudioSource implementation](https://github.com/livekit/node-sdks/blob/7af545433d9b923eb496da4274f65e122d44ef40/packages/livekit-rtc/src/audio_source.ts#L68), [realtime capabilities](https://docs.livekit.io/reference/agents-js/interfaces/agents.llm.RealtimeCapabilities.html), [adaptive interruption restrictions](https://docs.livekit.io/agents/logic/turns/adaptive-interruption-handling/), [Flux eager turns](https://developers.deepgram.com/docs/flux/voice-agent-eager-eot), [Cartesia cancellation](https://docs.cartesia.ai/use-the-api/tts-websocket/contexts), [Cartesia flush IDs](https://docs.cartesia.ai/use-the-api/tts-websocket/context-flushing-and-flush-i-ds), [Gemini session lifecycle](https://aistudio.google.com/docs/live-api/session-management), [LiveAvatar LITE](https://docs.liveavatar.com/docs/lite-mode/overview), [LiveAvatar events](https://docs.liveavatar.com/docs/lite-mode/events), [capture constraints](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints).

LiveAvatar's inspected event contract requires 24 kHz mono PCM16 input and recommends approximately one-second input chunks. That is a separate buffering decision from microphone transport frame size. Measure its effect on startup delay before selecting it for the pilot. Do not impose that chunk size on the voice path. [LiveAvatar events](https://docs.liveavatar.com/docs/lite-mode/events)

Retrieval need not require a model tool-call round trip. LiveKit documents retrieval before generation in a text pipeline. For NodeTool, preload a small approved exhibit brief and retrieve once against committed user text when an answer requires more evidence. Use explicit tools for optional queries and actions. Cache only by authorized knowledge revision, exhibit, language, and query. [Retrieval integration](https://docs.livekit.io/agents/logic/external-data/)

## What remains unproven

The shortlist is based on documented interfaces, not comparative benchmarks. Test required languages, children's speech if relevant, pronunciation of collection names, venue noise, provider cancellation, native Node dependencies, and regional hosting before choosing defaults. Do not treat a provider's low-latency claim as end-to-end performance evidence.

Pipecat's core license does not establish licenses for bundled models or commercial services. Preserve applicable notices if implementation code is reused. Keep the initial NodeTool implementation independently designed around the observed contracts and behavior tests.
