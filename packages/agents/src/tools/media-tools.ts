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
  animateImage,
  editImage,
  embedText,
  generateImage,
  generateSpeech,
  generateVideo,
  transcribeAudio
} from "../capabilities/media.js";
import type { CapabilityExport } from "../capabilities/index.js";

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
