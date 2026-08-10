/**
 * Creative critique tools — the judging half of a generate → look → critique →
 * revise loop, plus the taste pair that persists what the user prefers.
 *
 * @deprecated The judges are ported to the `media` capability module
 * (`../capabilities/media.ts`) and the taste pair to the `style` module
 * (`../capabilities/style.ts`). These are kept as thin subclasses so existing
 * constructors keep working; there is one implementation behind both.
 */

import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun
} from "../capabilities/index.js";
import {
  compareImages,
  critiqueImage,
  scoreImageAdherence
} from "../capabilities/media.js";
import {
  getStyleProfile,
  recordStylePreference
} from "../capabilities/style.js";
import type { CapabilityExport } from "../capabilities/index.js";
import type { LongTermMemory } from "../long-term-memory.js";

/** A judging capability as the `Tool` its callers still construct. */
abstract class JudgeTool extends CapabilityTool {
  constructor(entry: CapabilityExport) {
    super(entry.spec, entry.impl, (context) =>
      createCapabilityRun({ context, gate: UNGATED })
    );
  }
}

/**
 * A style capability as the `Tool` its callers still construct. The optional
 * bound memory becomes `run.memory`; without one the implementation falls back
 * to the per-user registry, exactly as the class did.
 */
abstract class StyleTool extends CapabilityTool {
  constructor(entry: CapabilityExport, bound: LongTermMemory | null) {
    super(entry.spec, entry.impl, (context) =>
      createCapabilityRun({
        context,
        gate: UNGATED,
        memory: bound ?? undefined
      })
    );
  }
}

export class CritiqueImageTool extends JudgeTool {
  constructor() {
    super(critiqueImage);
  }
}

export class CompareImagesTool extends JudgeTool {
  constructor() {
    super(compareImages);
  }
}

export class ScoreImageAdherenceTool extends JudgeTool {
  constructor() {
    super(scoreImageAdherence);
  }
}

export class RecordStylePreferenceTool extends StyleTool {
  constructor(bound: LongTermMemory | null = null) {
    super(recordStylePreference, bound);
  }
}

export class GetStyleProfileTool extends StyleTool {
  constructor(bound: LongTermMemory | null = null) {
    super(getStyleProfile, bound);
  }
}

/** Names of the creative critique tools. */
export const CREATIVE_CRITIQUE_TOOL_NAMES = [
  "critique_image",
  "compare_images",
  "score_image_adherence",
  "record_style_preference",
  "get_style_profile"
] as const;
