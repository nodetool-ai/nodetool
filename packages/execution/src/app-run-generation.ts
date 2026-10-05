import {
  GenerationAttempt,
  GenerationOutput,
  type Prediction,
  attachGenerationToAppRun,
  reconcileAppRunCost
} from "@nodetool-ai/models";
import type { AppRunContext } from "@nodetool-ai/runtime";

export function appRunGenerationMetadata(
  context?: AppRunContext
): Record<string, unknown> {
  return context
    ? {
        app_run_id: context.appRunId,
        app_instance_id: context.instanceId,
        app_run_user_id: context.userId
      }
    : {};
}

/** Recovery uses the accepted association, never a process-local context. */
export async function attachAppRunGenerationOutputs(
  generation: Prediction | null,
  outputs: readonly GenerationOutput[]
): Promise<void> {
  if (!generation) {
    return;
  }
  const runId = generation.metadata?.app_run_id;
  const ownerId = generation.metadata?.app_run_user_id;
  if (typeof runId !== "string" || ownerId !== generation.user_id) {
    return;
  }
  for (const output of outputs) {
    if (output.status !== "ready") {
      continue;
    }
    await attachGenerationToAppRun(
      generation.user_id,
      runId,
      generation.id,
      output.id
    );
  }
  await reconcileAppRunCost(generation.user_id, runId);
}

/** Legacy provider calls already own a prediction row. Add output references only. */
export async function attachLegacyAppRunGeneration(
  generation: Prediction
): Promise<void> {
  if (typeof generation.metadata?.app_run_id !== "string") {
    return;
  }
  const assets = generation.asset_ids ?? [];
  if (!assets.length) {
    return;
  }
  const { attempt } = await GenerationAttempt.ensureForGeneration({
    generation_id: generation.id,
    provider: generation.provider
  });
  const outputs: GenerationOutput[] = [];
  for (const [index, assetId] of assets.entries()) {
    const output = await GenerationOutput.upsertOutput({
      generation_id: generation.id,
      attempt_id: attempt.id,
      output_key: `app-run:${assetId}`,
      output_index: index,
      output_type: "media"
    });
    const ready = await GenerationOutput.transition(output.id, {
      status: "ready",
      asset_id: assetId
    });
    if (ready) {
      outputs.push(ready);
    }
  }
  await attachAppRunGenerationOutputs(generation, outputs);
}
