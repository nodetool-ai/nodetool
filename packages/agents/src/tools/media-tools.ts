/**
 * Generic provider-backed media generation tools for any agent loop.
 *
 * @deprecated Ported to the `media` capability module
 * (`../capabilities/media.ts`). These are kept as thin subclasses so existing
 * constructors keep working; there is one implementation behind both.
 */

import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun
} from "../capabilities/index.js";
import {
  MEDIA_CAPABILITIES,
  animateImage,
  editImage,
  embedText,
  generateImage,
  generateSpeech,
  generateVideo,
  transcribeAudio
} from "../capabilities/media.js";
import type { CapabilityExport } from "../capabilities/index.js";
import { toolFromCapability } from "../capabilities/index.js";
import type { Tool } from "./base-tool.js";

/** A media capability as the `Tool` its callers still construct. */
abstract class MediaTool extends CapabilityTool {
  constructor(entry: CapabilityExport) {
    super(entry.spec, entry.impl, (context) =>
      createCapabilityRun({ context, gate: UNGATED })
    );
  }
}

export class GenerateImageTool extends MediaTool {
  constructor() {
    super(generateImage);
  }
}

export class EditImageTool extends MediaTool {
  constructor() {
    super(editImage);
  }
}

export class GenerateVideoTool extends MediaTool {
  constructor() {
    super(generateVideo);
  }
}

export class AnimateImageTool extends MediaTool {
  constructor() {
    super(animateImage);
  }
}

export class GenerateSpeechTool extends MediaTool {
  constructor() {
    super(generateSpeech);
  }
}

export class TranscribeAudioTool extends MediaTool {
  constructor() {
    super(transcribeAudio);
  }
}

export class EmbedTextTool extends MediaTool {
  constructor() {
    super(embedText);
  }
}

/**
 * Every media capability as a `Tool`, derived from {@link MEDIA_CAPABILITIES}
 * rather than a hand-kept class list. The run is built per call from the
 * `ProcessingContext`, so the tools work wherever a context exists — an
 * AgentNode hydrating a saved belt does not need a providers map up front.
 */
export function getMediaTools(): Tool[] {
  return MEDIA_CAPABILITIES.map((entry) =>
    toolFromCapability(entry.spec, entry.impl, (context) =>
      createCapabilityRun({ context, gate: UNGATED })
    )
  );
}
