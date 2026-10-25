import { z } from "zod";
import {
  AUDIO_TOOL_CONTRACTS,
  audioRangeFromArgs,
  describeAudioEffects,
  type AudioToolName
} from "@nodetool-ai/protocol/api-schemas/asset-editor-tool-contracts.js";
import {
  uiToolParams,
  type UiToolArgs
} from "@nodetool-ai/protocol/api-schemas/ui-tool-contract.js";
import { FrontendToolRegistry } from "../frontendTools";
import { getAudioAgentHandler } from "../../../components/audio_editor/audioAgentBridge";
import { docUrl } from "./resourceLinks";

/**
 * Frontend tools that let the agent edit an audio asset open in the
 * workspace's sample editor: the toolbar edits, the effects, and Save. Every
 * tool but the effect list takes an explicit `asset_id` and delegates to the
 * handler that asset's open editor registers on the {@link audioAgentBridge}.
 * Names, descriptions and argument shapes come from the shared contracts the
 * headless eval bridge also registers.
 *
 * Each edit is one undo step in the editor and stays unsaved until
 * `ui_audio_save` or the user's Save.
 */

const assetIdParam = z
  .string()
  .describe(
    "Asset id of the audio to act on. The open audio ids are listed in the ui_context system prompt block."
  );

type AudioToolArgs<K extends AudioToolName> = UiToolArgs<
  (typeof AUDIO_TOOL_CONTRACTS)[K]
> & { asset_id: string };

/** One shared tool's name, description and parameters, plus `asset_id`. */
const shared = <K extends AudioToolName>(name: K) => ({
  name,
  description: AUDIO_TOOL_CONTRACTS[name].description,
  // `uiToolParams` answers `z.ZodType`; the contract's shape fixes the args.
  parameters: uiToolParams(AUDIO_TOOL_CONTRACTS[name], {
    asset_id: assetIdParam
  }) as unknown as z.ZodType<AudioToolArgs<K>>
});

FrontendToolRegistry.register({
  ...shared("ui_audio_get_state"),
  async execute({ asset_id }) {
    return { ok: true, ...getAudioAgentHandler(asset_id).getSnapshot() };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_audio_edit"),
  async execute({ asset_id, op, start, end, gain_db }) {
    const range = audioRangeFromArgs(start, end);
    const snapshot = getAudioAgentHandler(asset_id).edit(op, range, gain_db);
    return {
      ok: true,
      durationSeconds: snapshot.durationSeconds,
      dirty: snapshot.dirty,
      url: docUrl("asset", asset_id)
    };
  }
});

// Reads the static catalog, so it names no asset and works with none open.
FrontendToolRegistry.register({
  name: "ui_audio_list_effects",
  description: AUDIO_TOOL_CONTRACTS.ui_audio_list_effects.description,
  parameters: uiToolParams(AUDIO_TOOL_CONTRACTS.ui_audio_list_effects),
  async execute() {
    return { ok: true, effects: describeAudioEffects() };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_audio_apply_effect"),
  async execute({ asset_id, effect_id, params, start, end }) {
    const range = audioRangeFromArgs(start, end);
    const snapshot = await getAudioAgentHandler(asset_id).applyEffect(
      effect_id,
      params ?? {},
      range
    );
    return {
      ok: true,
      durationSeconds: snapshot.durationSeconds,
      dirty: snapshot.dirty,
      url: docUrl("asset", asset_id)
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_audio_save"),
  async execute({ asset_id }) {
    const snapshot = await getAudioAgentHandler(asset_id).save();
    return { ok: true, dirty: snapshot.dirty, url: docUrl("asset", asset_id) };
  }
});
