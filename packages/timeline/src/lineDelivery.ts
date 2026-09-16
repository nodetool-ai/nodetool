/**
 * Host-neutral request construction for revising one script-linked speech line.
 *
 * This module only captures and validates known Script context. Dispatch,
 * candidate landing, audition, and acceptance belong to host adapters.
 */

export const LINE_DELIVERY_ACTION = "change_line_delivery" as const;
export const LINE_DELIVERY_MODEL_TASK = "text_to_speech" as const;

export type LineDeliveryPace = "slow" | "normal" | "fast";

export interface LineDeliveryVoice {
  readonly provider: string;
  readonly model: string;
  readonly voice: string;
}

export interface LineDeliveryLine {
  readonly id?: string | null;
  readonly text?: string | null;
  readonly speakerId?: string | null;
  readonly direction?: string | null;
  readonly voiceOverride?: Partial<LineDeliveryVoice> | null;
  readonly targetDurationMs?: number | null;
}

export interface LineDeliveryCastMember {
  readonly id: string;
  readonly voice?: Partial<LineDeliveryVoice> | null;
}

export interface LineDeliverySourceContext {
  readonly scriptId: string;
  readonly lineId: string;
  readonly speakerId?: string;
  readonly text: string;
  readonly voice: LineDeliveryVoice;
  readonly direction?: string;
  readonly language?: string;
  readonly pace?: LineDeliveryPace;
  readonly targetDurationMs?: number;
}

export interface LineDeliveryRequest {
  readonly action: typeof LINE_DELIVERY_ACTION;
  readonly modelTask: typeof LINE_DELIVERY_MODEL_TASK;
  readonly sourceContext: LineDeliverySourceContext;
  /** Provider-facing delivery direction. Defaults to the line's authored direction. */
  readonly instructions?: string;
  /** Resolved provider speed. Explicit speed wins over the Script pace. */
  readonly speed?: number;
}

export interface LineDeliveryRequestInput {
  readonly scriptId?: string | null;
  readonly line: LineDeliveryLine;
  /** The cast member named by line.speakerId, when the line has one. */
  readonly castMember?: LineDeliveryCastMember | null;
  readonly language?: string | null;
  readonly pace?: LineDeliveryPace | null;
  readonly speed?: number | null;
  /** A new delivery instruction. The authored line direction remains captured. */
  readonly instructions?: string | null;
}

export interface LineDeliveryRequestError {
  readonly ok: false;
  readonly error: string;
}

export interface LineDeliveryRequestSuccess {
  readonly ok: true;
  readonly request: LineDeliveryRequest;
}

export type LineDeliveryRequestResult =
  | LineDeliveryRequestError
  | LineDeliveryRequestSuccess;

/** Immutable provenance an adapter can store beside a generated candidate. */
export interface LineDeliveryProvenance {
  readonly requestId: string;
  readonly request: LineDeliveryRequest;
}

/** Provider result fields needed by a candidate-landing adapter. */
export interface LineDeliveryResult {
  readonly requestId: string;
  readonly assetId: string;
  readonly durationMs: number;
  readonly costCredits?: number;
  readonly createdAt: string;
}

export interface LineDeliveryGenerateMediaPayload {
  readonly mode: "audio";
  readonly provider: string;
  readonly model: string;
  readonly voice: string;
  readonly prompt: string;
  readonly instructions?: string;
  readonly language?: string;
  readonly speed?: number;
  readonly duration?: number;
  readonly line_delivery_context: {
    readonly script_id: string;
    readonly line_id: string;
    readonly speaker_id?: string;
    readonly text: string;
    readonly direction?: string;
    readonly instructions?: string;
    readonly language?: string;
    readonly pace?: LineDeliveryPace;
    readonly speed?: number;
    readonly target_duration_ms?: number;
    readonly voice: LineDeliveryVoice;
  };
}

const PACE_SPEED: Readonly<Record<LineDeliveryPace, number>> = Object.freeze({
  slow: 0.85,
  normal: 1,
  fast: 1.15
});

const nonEmpty = (value: string | null | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const resolveVoice = (
  input: LineDeliveryRequestInput
): LineDeliveryVoice | LineDeliveryRequestError => {
  const override = input.line.voiceOverride;
  const voice =
    override === undefined || override === null
      ? input.castMember?.voice
      : override;
  const provider = nonEmpty(voice?.provider);
  const model = nonEmpty(voice?.model);
  const voiceId = nonEmpty(voice?.voice);
  if (!provider || !model || !voiceId) {
    return {
      ok: false,
      error:
        "Change line delivery requires an effective voice with provider, model, and voice."
    };
  }
  return Object.freeze({ provider, model, voice: voiceId });
};

const resolveSpeed = (
  speed: number | null | undefined,
  pace: LineDeliveryPace | undefined
): number | undefined | LineDeliveryRequestError => {
  if (speed !== undefined && speed !== null) {
    if (!Number.isFinite(speed) || speed < 0.25 || speed > 4) {
      return {
        ok: false,
        error: "Change line delivery speed must be between 0.25 and 4."
      };
    }
    return speed;
  }
  return pace === undefined ? undefined : PACE_SPEED[pace];
};

/** Validate and freeze all Script-owned inputs before an adapter dispatches. */
export function createLineDeliveryRequest(
  input: LineDeliveryRequestInput
): LineDeliveryRequestResult {
  const scriptId = nonEmpty(input.scriptId);
  if (!scriptId) {
    return {
      ok: false,
      error: "Change line delivery requires a linked scriptId."
    };
  }
  const lineId = nonEmpty(input.line.id);
  if (!lineId) {
    return {
      ok: false,
      error: "Change line delivery requires a linked lineId."
    };
  }
  const text = nonEmpty(input.line.text);
  if (!text) {
    return {
      ok: false,
      error: "Change line delivery requires nonempty line text."
    };
  }

  const speakerId = nonEmpty(input.line.speakerId);
  if (
    speakerId &&
    input.castMember &&
    nonEmpty(input.castMember.id) !== speakerId
  ) {
    return {
      ok: false,
      error:
        "Change line delivery received a cast member for another line speaker."
    };
  }

  const voice = resolveVoice(input);
  if ("ok" in voice) return voice;

  const pace = input.pace ?? undefined;
  const speed = resolveSpeed(input.speed, pace);
  if (typeof speed === "object") return speed;

  const targetDurationMs = input.line.targetDurationMs ?? undefined;
  if (
    targetDurationMs !== undefined &&
    (!Number.isFinite(targetDurationMs) || targetDurationMs <= 0)
  ) {
    return {
      ok: false,
      error: "Change line delivery target duration must be positive."
    };
  }

  const direction = nonEmpty(input.line.direction);
  const explicitInstructions = nonEmpty(input.instructions);
  const instructions = explicitInstructions ?? direction;
  const language = nonEmpty(input.language);
  const sourceContext: LineDeliverySourceContext = Object.freeze({
    scriptId,
    lineId,
    ...(speakerId !== undefined && { speakerId }),
    text,
    voice,
    ...(direction !== undefined && { direction }),
    ...(language !== undefined && { language }),
    ...(pace !== undefined && { pace }),
    ...(targetDurationMs !== undefined && { targetDurationMs })
  });
  const request: LineDeliveryRequest = Object.freeze({
    action: LINE_DELIVERY_ACTION,
    modelTask: LINE_DELIVERY_MODEL_TASK,
    sourceContext,
    ...(instructions !== undefined && { instructions }),
    ...(speed !== undefined && { speed })
  });
  return Object.freeze({ ok: true, request });
}

/** Map a validated request onto the direct `generate_media` audio contract. */
export function lineDeliveryGenerateMediaData(
  request: LineDeliveryRequest
): LineDeliveryGenerateMediaPayload {
  const context = request.sourceContext;
  const lineDeliveryContext = Object.freeze({
    script_id: context.scriptId,
    line_id: context.lineId,
    ...(context.speakerId !== undefined && { speaker_id: context.speakerId }),
    text: context.text,
    ...(context.direction !== undefined && { direction: context.direction }),
    ...(request.instructions !== undefined && {
      instructions: request.instructions
    }),
    ...(context.language !== undefined && { language: context.language }),
    ...(context.pace !== undefined && { pace: context.pace }),
    ...(request.speed !== undefined && { speed: request.speed }),
    ...(context.targetDurationMs !== undefined && {
      target_duration_ms: context.targetDurationMs
    }),
    voice: context.voice
  });
  return Object.freeze({
    mode: "audio",
    provider: context.voice.provider,
    model: context.voice.model,
    voice: context.voice.voice,
    prompt: context.text,
    ...(request.instructions !== undefined && {
      instructions: request.instructions
    }),
    ...(context.language !== undefined && { language: context.language }),
    ...(request.speed !== undefined && { speed: request.speed }),
    ...(context.targetDurationMs !== undefined && {
      duration: context.targetDurationMs / 1000
    }),
    line_delivery_context: lineDeliveryContext
  });
}
