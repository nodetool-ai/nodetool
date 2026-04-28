import { z } from "zod";
import { uiSearchModelsParams } from "@nodetool-ai/protocol";
import { FrontendToolRegistry } from "../frontendTools";
import { trpc } from "../../trpc";

type RawModel = {
  id?: string;
  name?: string;
  provider?: string | null;
  type?: string | null;
  repo_id?: string | null;
  description?: string | null;
  downloaded?: boolean | null;
  path?: string | null;
};

FrontendToolRegistry.register({
  name: "ui_search_models",
  description:
    "List models available to the user for a given task category. Sourced from the user's configured providers (live model lists) plus curated recommendations as a fallback. Each entry is a **ready-to-paste object** for the matching node's `model` property — call `ui_update_node_data({ node_id, data: { properties: { model: <entry> } } })` directly. Do NOT pass a bare id string; the node reads `model.provider` and `model.id` separately.",
  parameters: z.object(uiSearchModelsParams),
  async execute({ kind, limit }) {
    const max = Math.max(1, Math.min(50, limit ?? 20));
    const raw = (await trpc.models.availableForKind.query({
      kind
    })) as RawModel[];
    const models = (raw ?? []).slice(0, max).map((m) => ({
      type: m.type ?? null,
      provider: m.provider ?? null,
      id: m.id ?? m.repo_id ?? m.name ?? "",
      name: m.name ?? m.id ?? m.repo_id ?? "",
      repo_id: m.repo_id ?? null,
      path: m.path ?? null,
      downloaded: m.downloaded ?? null,
      description: m.description ?? null
    }));
    return {
      ok: true,
      kind,
      count: models.length,
      models,
      usage:
        "Pass the chosen entry directly as the node's `model` property: ui_update_node_data({ node_id, data: { properties: { model: <entry> } } })"
    };
  }
});
