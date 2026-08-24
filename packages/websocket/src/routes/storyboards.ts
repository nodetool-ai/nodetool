/**
 * Storyboard zip download — `GET /api/storyboards/:id/export-zip`.
 *
 * The web app reads and writes boards over `/trpc/storyboards.*`; this is the
 * one non-tRPC door, because the response is a binary archive rather than
 * JSON. It packs the board as Markdown plus its stills and clips
 * (`lib/storyboard-export.ts`).
 */

import type { FastifyPluginAsync } from "fastify";
import { Storyboard } from "@nodetool-ai/models";
import type { Shot } from "@nodetool-ai/protocol";
import { bridge } from "../lib/bridge.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";
import { resolveAssetBytesForExport } from "../lib/asset-export.js";
import {
  packStoryboardZip,
  type StoryboardExportInput
} from "../lib/storyboard-export.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

/**
 * Bytes for one shot's media ref.
 *
 * `resolveAssetBytesForExport` covers the stored forms (`asset://`,
 * `/api/storage/`, and a remote URL through `safeFetch`). A shot generated in
 * the browser can also carry its still inline as a `data:` URI, which needs no
 * fetch at all — decode it here rather than teaching the shared resolver about
 * a form only this surface sees.
 */
async function resolveShotMediaBytes(ref: string): Promise<Uint8Array | null> {
  if (ref.startsWith("data:")) {
    const comma = ref.indexOf(",");
    if (comma < 0) return null;
    const meta = ref.slice(0, comma);
    const payload = ref.slice(comma + 1);
    try {
      return meta.endsWith(";base64")
        ? new Uint8Array(Buffer.from(payload, "base64"))
        : new Uint8Array(Buffer.from(decodeURIComponent(payload), "utf8"));
    } catch {
      // A malformed data URI is unresolvable media, reported as missing.
      return null;
    }
  }
  return resolveAssetBytesForExport(ref);
}

function zipResponse(bytes: Uint8Array, name: string): Response {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "_") || "storyboard";
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-length": String(bytes.byteLength),
      "content-disposition": `attachment; filename="${safe}.zip"`,
      "cache-control": "no-store"
    }
  });
}

const storyboardsRoutes: FastifyPluginAsync<RouteOptions> = async (
  app,
  opts
) => {
  const { apiOptions } = opts;

  app.get("/api/storyboards/:id/export-zip", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, async (request) => {
      const userId = getUserId(request, apiOptions.userIdHeader ?? "x-user-id");
      const board = await Storyboard.findById(id);
      // Boards are per-user, like sketches and timelines: another owner's
      // board is an absence, not a refusal.
      if (!board || board.user_id !== userId) {
        return new Response(JSON.stringify({ detail: "Storyboard not found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        });
      }
      const doc = board.toDocument();
      const screenplay = doc.screenplay;
      // The store keeps the shots in both places; a board written by an older
      // path can carry them only on the screenplay.
      const shots = (
        doc.shots.length > 0 ? doc.shots : (screenplay?.shots ?? [])
      ) as Shot[];
      const input: StoryboardExportInput = {
        name: board.name,
        shots,
        title: screenplay?.title || board.name,
        brief: doc.brief,
        style: doc.style,
        aspectRatio: doc.aspectRatio
      };
      if (screenplay?.logline) input.logline = screenplay.logline;
      if (screenplay?.narration) input.narration = screenplay.narration;
      if (screenplay?.music_prompt) input.musicPrompt = screenplay.music_prompt;

      const { bytes } = await packStoryboardZip({
        board: input,
        fetchAssetBytes: resolveShotMediaBytes
      });
      return zipResponse(bytes, board.name || screenplay?.title || "storyboard");
    });
  });
};

export default storyboardsRoutes;
