import type { ASRModel } from "../../../../stores/ApiTypes";
import useRuntimePackagesStore from "../../../../stores/RuntimePackagesStore";
import { trpc } from "../../../../lib/trpc";

/** The runtime package id the desktop app installs whisper.cpp under. */
export const WHISPER_CPP_PACKAGE = "whisper-cpp";

/** The provider id whisper.cpp models report. */
export const WHISPER_CPP_PROVIDER = "whisper_cpp";

/** Model name prefixes, best first, matching the recommended downloads. */
const WHISPER_MODEL_PREFERENCE = ["large-v3-turbo", "small", "base"];

export interface AsrModelChoice {
  provider: string;
  id: string;
  name: string;
}

/**
 * What the desktop app can transcribe with when no default is pinned:
 * - `model`: whisper.cpp is installed and has a model on disk.
 * - `missing`: whisper.cpp is not installed, so the install can be offered.
 * - `no_model`: installed, but no model is downloaded yet.
 * - `unavailable`: not the desktop app, or its package status is unknown.
 */
export type DesktopAsrDefault =
  | { kind: "model"; model: AsrModelChoice }
  | { kind: "missing" }
  | { kind: "no_model" }
  | { kind: "unavailable" };

/** The downloaded whisper.cpp model to default to, or null when none is. */
export function pickWhisperModel(
  models: readonly ASRModel[]
): AsrModelChoice | null {
  const local = models.filter((m) => m.provider === WHISPER_CPP_PROVIDER);
  if (local.length === 0) {
    return null;
  }
  const rank = (model: ASRModel): number => {
    const name = (model.name || model.id).toLowerCase();
    const index = WHISPER_MODEL_PREFERENCE.findIndex((prefix) =>
      name.startsWith(prefix)
    );
    return index === -1 ? WHISPER_MODEL_PREFERENCE.length : index;
  };
  const best = [...local].sort((a, b) => rank(a) - rank(b))[0];
  return {
    provider: WHISPER_CPP_PROVIDER,
    id: best.id,
    name: best.name || best.id
  };
}

/** Whether the desktop app reports whisper.cpp installed, or null when unknown. */
export async function isWhisperCppInstalled(): Promise<boolean | null> {
  const runtime = useRuntimePackagesStore.getState();
  if (!runtime.available) {
    return null;
  }
  await runtime.refresh();
  const { statuses, error } = useRuntimePackagesStore.getState();
  const status = statuses.find((p) => p.id === WHISPER_CPP_PACKAGE);
  if (error || !status) {
    return null;
  }
  return status.installed;
}

/**
 * The desktop app transcribes locally with whisper.cpp by default. Resolves
 * which whisper.cpp model that is, or why there is none yet.
 */
export async function resolveDesktopAsrDefault(): Promise<DesktopAsrDefault> {
  const installed = await isWhisperCppInstalled();
  if (installed === null) {
    return { kind: "unavailable" };
  }
  if (!installed) {
    return { kind: "missing" };
  }
  const models = (await trpc.models.asrByProvider.query({
    provider: WHISPER_CPP_PROVIDER
  })) as ASRModel[];
  const model = pickWhisperModel(models);
  return model ? { kind: "model", model } : { kind: "no_model" };
}
