# Reference-to-Video Provider Contract — Technical Design

**Status:** Draft for review
**Related:** [providers.md](../providers.md), [models-and-providers.md](../models-and-providers.md), [media-generation-tracking-design.md](../media-generation-tracking-design.md)

---

## 1. Summary

NodeTool needs a separate `reference_to_video` capability for video models that
use images and clips as identity, style, scene, motion, or audio references.
Those inputs do not define the first output frame.

The current `image_to_video` contract cannot represent that distinction. Its
public method accepts an image list, but its documented meaning is “animate the
first image.” Some providers send only `images[0]`; others send every image to a
list field. Manifest discovery also classifies endpoints named
`reference-to-video` as `image_to_video`. The same workflow therefore changes
meaning when its provider changes.

This design adds:

- a provider capability and method named `reference_to_video` /
  `referenceToVideo`;
- role-named reference image and reference video inputs;
- a generic `nodetool.video.ReferenceToVideo` node;
- task discovery that keeps reference models out of the image-to-video picker;
- direct-provider mappings for providers whose existing manifests describe
  reference inputs; and
- a Python bridge operation that stages multiple inputs for command-backed
  providers such as WanGP.

`image_to_video` remains the start-frame operation. No provider falls back from
one operation to the other.

## 2. Current behavior

The current path is:

```text
ImageToVideo node
  -> ProcessingContext.runProviderPrediction(capability=image_to_video)
  -> BaseProvider.imageToVideo(images, params)
  -> direct provider OR PythonProvider
       direct provider: provider-specific image mapping
       PythonProvider: sends only images[0]
         -> provider.image_to_video MsgPack request
         -> nodetool-core stages one input-image file
         -> command adapter receives image_path
  -> encoded video bytes
```

The contract diverges at three points:

- `ImageToVideoParams` says the first image drives the animation.
- FAL, KIE, and Replicate can forward several images when a manifest declares a
  list input.
- AtlasCloud and manifest task inference route reference-to-video endpoints
  through `image_to_video`, although those endpoints also accept reference
  videos and assign no start-frame role to their images.

The Python path loses every image after the first. The WanGP adapter then maps
that image to `image_start` with `image_prompt_type = "S"`, even when the model
metadata declares reference-image support.

## 3. Goals

1. Give start frames and reference media different provider contracts.
2. Preserve input order within each media kind.
3. Support several reference images and several reference videos.
4. Let model discovery expose only models that implement the requested task.
5. Use one contract across direct TypeScript providers and Python workers.
6. Stage remote-worker media without exposing host paths to the worker.
7. Keep generation cancellation, progress, tracking, and chunked output working.

## 4. Non-goals

- Reference audio as a separate input. A reference video's audio may be used
  through one boolean option, but standalone audio references need their own
  later contract.
- First/last-frame and keyframe authoring. Those are ordered frame constraints,
  not reference media.
- Video-to-video editing, extension, retake, or motion control.
- A new chat composer mode or agent media capability in the first change. The
  workflow node and `ProcessingContext` provider seam are the initial surfaces.
- Provider-specific controls that have no common meaning.
- Changing upstream WanGP code.

## 5. Operation semantics

| Capability           | Required media                        | Media role                                                        |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| `text_to_video`      | none                                  | Prompt creates the clip.                                          |
| `image_to_video`     | one start image                       | The image defines the first output frame.                         |
| `reference_to_video` | at least one reference image or video | Media guides identity, style, composition, motion, or soundtrack. |
| `video_to_video`     | one source video                      | The source clip is transformed.                                   |

The operation name describes intent. A model may support more than one row,
but each call enters through one method and gets one input interpretation.

### D1. Add a method instead of extending `imageToVideo`

Adding `referenceVideos` to `ImageToVideoParams` would leave the image role
ambiguous. Providers that use only the first image would keep producing
different results from schema-driven providers. A separate method makes an
unsupported mapping fail before spending money.

The same change makes the provider-level `imageToVideo` input singular:

```ts
imageToVideo(
  image: Uint8Array,
  params: ImageToVideoParams
): Promise<Uint8Array>;
```

This removes the unused multi-image interpretation from the start-frame
contract. `ImageToVideoNode` keeps its existing serialized `list[image]`
property so saved workflows still load, but resolves and sends only the first
non-empty image. Reference workflows move to `ReferenceToVideo`.

### D2. Use a typed input object

The provider method receives media in an object so the two ordered lists cannot
be swapped accidentally:

```ts
export interface ReferenceToVideoInputs {
  images: Uint8Array[];
  videos: Uint8Array[];
}

export interface ReferenceToVideoParams extends TextToVideoParams {
  /** Let a provider use audio tracks carried by reference videos. */
  useReferenceVideoAudio?: boolean | null;
}

referenceToVideo(
  inputs: ReferenceToVideoInputs,
  params: ReferenceToVideoParams
): Promise<Uint8Array>;
```

`prompt` stays required at the provider contract. Providers whose API permits
an empty prompt may receive `""`, matching `textToVideo` behavior.

`ProcessingContext` filters empty buffers and rejects the call when both
resulting lists are empty. It does not infer reference media from `entities`;
entity descriptors may still join the prompt through the existing path.

### D3. Keep provider limits out of the shared type

Providers differ on image count, video count, file size, duration, format, and
whether video audio can be used. Each provider validates its model's declared
limits before upload or submission. Model metadata may expose limits later, but
the common method will not encode one provider's limits as global rules.

## 6. Runtime contract

### 6.1 Capability and model metadata

Add `reference_to_video` to:

- `ProviderCapability` in runtime and `ProcessingContext`;
- protocol task unions used by model search and prediction records;
- `VideoModel.supportedTasks` values produced by provider discovery;
- model filtering for `video_model` properties; and
- the task vocabulary accepted by model-search tools.

`providerCapabilities(instance)` advertises `reference_to_video` only when the
provider overrides `BaseProvider.referenceToVideo`. A provider having video
models is not enough.

### 6.2 ProcessingContext dispatch

The provider prediction request uses snake_case with binary arrays:

```ts
{
  provider: "wangp",
  capability: "reference_to_video",
  model: "minimax_h3_ref2va_pruned_pdd",
  params: {
    reference_images: [imageBytes1, imageBytes2],
    reference_videos: [videoBytes1],
    prompt: "Keep the person from image 1 and the motion from video 1",
    use_reference_video_audio: true,
    duration_seconds: 5,
    aspect_ratio: "16:9",
    resolution: "768p"
  }
}
```

`ProcessingContext.dispatchCapability` converts this to:

```ts
provider.referenceToVideo(
  {
    images: coerceByteList(params.reference_images),
    videos: coerceByteList(params.reference_videos)
  },
  {
    model,
    prompt,
    useReferenceVideoAudio,
    negativePrompt,
    durationSeconds,
    aspectRatio,
    resolution,
    timeoutSeconds,
    signal
  }
);
```

`coerceByteList` accepts only non-empty `Uint8Array` values. Unlike the current
image helper, it has no singular compatibility field because this is a new
operation.

### 6.3 Generic workflow node

Add `nodetool.video.ReferenceToVideo` with these properties:

| Property                    | Type          | Notes                                                  |
| --------------------------- | ------------- | ------------------------------------------------------ |
| `reference_images`          | `list[image]` | Ordered identity, style, subject, or scene references. |
| `reference_videos`          | `list[video]` | Ordered motion, scene, edit, or soundtrack references. |
| `model`                     | `video_model` | Filtered by `reference_to_video`.                      |
| `prompt`                    | `str`         | Uses “image 1” and “video 1” numbering in list order.  |
| `use_reference_video_audio` | `bool`        | Requests soundtrack conditioning where supported.      |
| `negative_prompt`           | `str`         | Passed only when the provider declares it.             |
| `aspect_ratio`              | `str`         | Existing video values.                                 |
| `resolution`                | `str`         | Existing video values.                                 |
| `duration`                  | `int`         | Existing video duration values.                        |
| `timeout_seconds`           | `int`         | Existing provider timeout behavior.                    |

The node resolves every media ref with `imageBytesAsync` or `videoBytesAsync`,
rejects an empty combined input, and returns a normal `VideoRef`. It uses the
existing generation tracking and asset-save path.

`ImageToVideoNode` keeps its serialized shape. Its description changes to say
that only the first non-empty image is the start frame and directs
reference-media workflows to `ReferenceToVideo`.

## 7. Model task discovery

### D4. Classify reference endpoints before image-conditioned endpoints

`inferVideoTasks` checks these reference forms before the generic
image-conditioned rules:

- `reference-to-video`
- `reference to video`
- `referencetovideo`
- `ref-to-video`
- `r2v`

They map to `reference_to_video`, not `image_to_video`.

For manifest entries without a descriptive id, video-output entries qualify
when they declare one of:

- `reference_images` as an image list;
- `reference_videos` as a video list; or
- a mixed reference field such as `refers`, reached through manifest
  `wrapInto` metadata.

Explicit `supportedTasks` remains authoritative. A model may explicitly list
both `image_to_video` and `reference_to_video` when its API assigns semantics by
input count.

`narrowTasksByRequiredInputs` treats a required reference video as evidence for
`reference_to_video`. It must not reclassify that endpoint as `video_to_video`,
because the reference clip is not the transformed source.

## 8. Direct-provider mappings

### D5. Map from manifest roles, not field order

Schema-driven providers need a reference-specific selector. The current
primary-image selector intentionally skips fields containing `reference`, so it
must not be reused.

| Provider            | Mapping                                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FAL                 | Upload each buffer through FAL storage. Map image URLs and video URLs to manifest fields whose semantic name contains `reference`, preserving list order and list shape.                                  |
| KIE                 | Generalize the current image uploader to typed media uploads. Use manifest upload records for `reference_images` and `reference_videos`, including their API parameter names.                             |
| Replicate           | Encode or upload each reference using the existing SDK input conventions. Select reference fields rather than the primary image/video field.                                                              |
| AtlasCloud          | Convert resolved media to correctly typed data URLs, then map `reference_images` and `reference_videos`. When manifest fields share `wrapInto`, append ordered `{url, type}` records to that mixed array. |
| MiniMax             | Advertise `S2V-01` as `reference_to_video`. It accepts one reference image, no reference video, and maps it to `subject_reference`. Other MiniMax models keep their existing tasks.                       |
| NodeTool delegation | Forward the complete typed input object to the delegated provider.                                                                                                                                        |

OpenAI, direct Gemini Veo, Together, Evolink, and xAI keep
`image_to_video` only until their direct adapters implement a verified
reference-media request shape. A provider endpoint available through FAL or KIE
does not imply that the direct provider implements the same contract.

Provider tests assert the complete outgoing request for at least one
image-only, video-only, and mixed reference model. Tests also assert that a
single-frame model is absent from the reference picker.

## 9. Python bridge protocol

### 9.1 TypeScript bridge

Add this bridge method:

```ts
providerReferenceToVideo(
  providerId: string,
  inputs: ReferenceToVideoInputs,
  params: Record<string, unknown>,
  secrets?: Record<string, string>,
  signal?: AbortSignal
): Promise<Uint8Array>;
```

It sends one MsgPack request:

```text
type: provider.reference_to_video
request_id: <uuid>
data:
  provider: wangp
  reference_images: [bin, ...]
  reference_videos: [bin, ...]
  params: {...}
  blob_transfer: chunked-v1
```

`blob_transfer` still describes the result. The worker returns the video through
the existing `blob.start`, `blob.chunk`, `blob.end`, and terminal `result`
frames. Adapter progress frames keep using the request id.

### D6. Bound inline inputs before adding an upload protocol

The current bridge already sends provider input media inline, and the worker's
maximum frame is 256 MiB. The first version keeps that transport and rejects a
reference request whose combined input exceeds 192 MiB. This leaves room for
MsgPack keys, parameters, and framing without relying on the hard limit.

The error reports the measured size and limit before opening a provider job.
A request-side chunk protocol is separate work because it needs staging state,
expiry, cancellation, and reconnect behavior. It should serve every binary
provider operation rather than exist only for this method.

### 9.2 Python worker staging

`nodetool-core` handles `provider.reference_to_video` through the existing
command-adapter path:

1. Validate that the provider advertises `reference_to_video`.
2. Validate the arrays and combined byte limit.
3. Create one request-scoped temporary directory.
4. Sniff each image/video suffix from its bytes.
5. Write unique files such as `reference-image-0.png` and
   `reference-video-0.mp4`.
6. Invoke the adapter with JSON containing `reference_image_paths` and
   `reference_video_paths`.
7. Read the result path and return the encoded video through chunked output.
8. Remove all staged inputs on success, failure, or cancellation.

The adapter JSON contains paths, not media bytes:

```json
{
  "operation": "reference_to_video",
  "provider": "wangp",
  "params": {
    "model": "minimax_h3_ref2va_pruned_pdd",
    "prompt": "...",
    "useReferenceVideoAudio": true
  },
  "reference_image_paths": ["/tmp/nodetool-provider-.../reference-image-0.png"],
  "reference_video_paths": ["/tmp/nodetool-provider-.../reference-video-0.mp4"]
}
```

The bridge protocol version increments, but its minimum compatible version does
not. Older workers omit the capability from `provider.list`; the model picker
therefore cannot select the operation. A forced call receives an unsupported
operation error.

## 10. WanGP adapter mapping

WanGP remains isolated in its own interpreter. Only the combined-image adapter
imports WanGP.

The adapter advertises `reference_to_video` only for metadata that declares a
reference image or reference video input. It maps:

| NodeTool input                  | WanGP setting                                              |
| ------------------------------- | ---------------------------------------------------------- |
| `reference_image_paths`         | `image_refs`                                               |
| first reference video           | `video_guide`                                              |
| second reference video          | `video_guide2`                                             |
| one reference video             | metadata-supported `video_prompt_type` containing `VG`     |
| two reference videos            | metadata-supported `video_prompt_type` containing `V+G`    |
| `useReferenceVideoAudio = true` | metadata-supported audio prompt mode for guide-video audio |

The adapter reads choice values from WanGP model metadata. It does not hardcode
a prompt-mode value that the selected model does not advertise. It validates
the model's counts before `session.run_task` and returns a clear error for an
unsupported combination.

`image_to_video` keeps mapping its one input to `image_start` and
`image_prompt_type = "S"`. No upstream WanGP files change.

## 11. Errors and validation

Errors must identify the provider and model and occur before submission when
NodeTool can detect them.

| Condition                               | Result                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------- |
| No non-empty reference input            | `reference_to_video requires at least one reference image or video`         |
| Provider does not override the method   | `<provider> does not support referenceToVideo`                              |
| Model lacks the task                    | Model is filtered from selection; a forced call fails before upload.        |
| Provider accepts images but not videos  | Error names the model and unsupported reference kind.                       |
| Too many references or invalid format   | Provider validation reports the declared limit.                             |
| Combined bridge input exceeds 192 MiB   | Bridge rejects before sending the frame.                                    |
| Worker disconnects or call is cancelled | Existing abort and adapter termination paths run; staged files are removed. |
| Adapter returns no file                 | Existing provider-adapter result error is used.                             |

No prompt or media bytes are logged or attached to traces. Logs may include
provider id, model id, media counts, total input bytes, duration, and request id.

## 12. File-level change map

### `nodetool`

- `packages/runtime/src/providers/types.ts`: input and parameter types.
- `packages/runtime/src/providers/base-provider.ts`: capability and base method.
- `packages/runtime/src/context.ts`: prediction union and dispatch.
- `packages/runtime/src/providers/python-provider.ts`: Python bridge mapping.
- `packages/runtime/src/python-bridge-types.ts`: bridge interface.
- `packages/runtime/src/python-bridge-base.ts`: wire request and size check.
- `packages/runtime/src/swappable-python-bridge.ts`: forwarding method.
- `packages/runtime/src/providers/manifest-models.ts`: reference task inference
  and reference-field helpers.
- Direct provider files for FAL, KIE, Replicate, AtlasCloud, MiniMax, and
  NodeTool delegation, plus the mechanical change to a singular
  `imageToVideo` input in every current provider.
- `packages/protocol/src/api-types.ts` and model-search schemas: task vocabulary.
- `packages/video-nodes/src/nodes/video.ts`: generic node.
- `packages/video-nodes/src/index.ts` and `packages/base-nodes/src/index.ts`:
  exports.
- `web/src/components/properties/ModelProperty.tsx`: node-to-task mapping.

### `nodetool-core`

- `src/nodetool/worker/provider_handler.py`: operation dispatch, byte checks,
  media suffix detection, staging, cleanup, and adapter payload.
- Worker protocol schema/version files: new request type and capability value.
- Provider handler and frame-contract tests.

### `nodetool-wan2gp`

- `combined/provider_adapter.py`: discovery and WanGP setting mapping.
- `Dockerfile.combined`: advertised adapter capability.
- Combined-adapter tests and contract documentation.

## 13. Test plan

### Runtime

- `ProcessingContext` preserves the order of both reference lists.
- `ProcessingContext` sends one start image to `imageToVideo`.
- Empty buffers are removed; two empty lists fail.
- `PythonProvider` forwards every reference instead of selecting index zero.
- Bridge tests assert the full MsgPack frame and chunked video result.
- The 192 MiB check fails without sending a frame.
- Cancellation reaches direct and Python providers.

### Model discovery

- Reference names infer only `reference_to_video`.
- First-frame, keyframe, and video-to-video names keep their existing tasks.
- Reference media fields infer the capability when the id is ambiguous.
- Explicit task metadata overrides inference.
- Provider-level capability discovery requires a method override.

### Direct providers

- FAL and KIE preserve image/video list order and use declared reference fields.
- Replicate maps list and singular fields without using a primary source slot.
- AtlasCloud builds separate arrays and a mixed `refers` array correctly.
- MiniMax `S2V-01` maps one image to `subject_reference` and rejects videos.
- Unsupported models fail before the network call.

### Workflow node

- Asset, file, and inline references resolve to bytes.
- Mixed image/video input reaches `runProviderPrediction` unchanged.
- No-reference input fails with an actionable message.
- Output bytes become a typed `VideoRef` and retain auto-save behavior.

### Python worker and WanGP

- The worker stages several media files with unique names and detected suffixes.
- A fake adapter receives ordered path lists and emits progress plus a video.
- Cancellation terminates the adapter and removes the temporary directory.
- WanGP settings tests cover images only, one video, two videos, mixed media,
  guide-video audio on/off, and unsupported model combinations.
- The package boundary check continues to find no WanGP or `mmgp` imports under
  the public node package, tests, or scripts.

## 14. Rollout

1. Add the additive worker operation and publish `nodetool-core`.
2. Add the WanGP adapter mapping, pin the new core revision, and build the
   combined image.
3. Add the NodeTool runtime contract, direct-provider mappings, model
   discovery, and workflow node.
4. Test one image-only, one video-only, and one mixed WanGP request on the
   deployed worker.
5. Test one schema-driven cloud provider with mixed references.

Capability discovery is the rollout gate. An older worker or adapter does not
advertise `reference_to_video`, so its models stay out of the new node's picker.
The text-to-video path does not change. Image-to-video keeps its wire operation
and start-frame behavior, but every direct provider now receives one image.

A saved `ImageToVideo` workflow that selected a reference-only model is not
rewritten automatically because the new node has different input roles. Static
validation reports that the model lacks `image_to_video`; the workflow author
replaces the node and reconnects the references explicitly.

## 15. Acceptance criteria

- `ReferenceToVideo` can submit ordered image and video references to a direct
  provider and to WanGP through a remote Python worker.
- Model selection shows reference-capable models and excludes start-frame-only
  models.
- `ImageToVideo` still maps its first image to the provider's start-frame field.
- No reference input is silently dropped or assigned a different role.
- Unsupported media kinds fail before provider submission.
- Remote generation reports progress, supports cancellation, and returns the
  video through chunked output.
- WanGP remains unmodified and isolated from the public NodeTool environment.
