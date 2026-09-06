/**
 * Timeline zip download and upload —
 *   `GET  /api/timelines/:id/export-zip`
 *   `POST /api/timelines/import-zip`
 *
 * The web app reads and writes sequences over `/trpc/timeline.*`; these are the
 * two non-tRPC doors, because one response is a binary archive and the other
 * request is a multipart upload. Both go through `lib/timeline-bundle.ts`, so a
 * bundle written here imports anywhere.
 */

import type { FastifyPluginAsync } from "fastify";
import {
  Asset,
  TimelineSequence,
  timelineDocumentDurationMs,
  type TimelineDocument
} from "@nodetool-ai/models";
import { bridge } from "../lib/bridge.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";
import { retrieveAssetBytes } from "../lib/asset-paths.js";
import { createAssetModelInterface } from "../lib/asset-model-interface.js";
import { getAssetAdapter } from "../lib/storage.js";
import {
  importTimelineBundle,
  packTimelineBundle,
  type BundledTimeline,
  type FetchedTimelineAsset
} from "../lib/timeline-bundle.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

/** The `LOOSE_PROJECT_ID` value: documents that belong to no project. */
const DEFAULT_PROJECT_ID = "default";

function jsonError(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function zipResponse(bytes: Uint8Array, name: string): Response {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "_") || "timeline";
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

/** Bytes for one asset the caller owns, or null when the row or object is gone. */
async function fetchOwnedAsset(
  userId: string,
  assetId: string
): Promise<FetchedTimelineAsset | null> {
  const asset = (await Asset.get(assetId)) as Asset | null;
  // Another owner's asset is an absence here, not a refusal: a clip can name an
  // id that is not the caller's, and an export must not copy those bytes out.
  if (!asset || asset.user_id !== userId) {
    return null;
  }
  const bytes = await retrieveAssetBytes(
    getAssetAdapter(),
    asset.user_id,
    asset.id,
    asset.content_type
  );
  if (!bytes) {
    return null;
  }
  return { bytes, name: asset.name, contentType: asset.content_type };
}

/** The bundle payload for a stored sequence: the wire shape minus db fields. */
function toBundledTimeline(seq: TimelineSequence): BundledTimeline {
  const wire = seq.toTimelineSequence();
  const bundled: BundledTimeline = {
    name: wire.name,
    fps: wire.fps,
    width: wire.width,
    height: wire.height,
    durationMs: wire.durationMs,
    tracks: wire.tracks,
    clips: wire.clips,
    markers: wire.markers,
    transcript: wire.transcript ?? []
  };
  if (wire.workflowId) {
    bundled.workflowId = wire.workflowId;
  }
  if (wire.scriptEnabled !== undefined) {
    bundled.scriptEnabled = wire.scriptEnabled;
  }
  return bundled;
}

/** The uploaded zip plus the form fields that came with it. */
interface ImportUpload {
  zipBytes: Uint8Array;
  projectId: string;
  name?: string;
}

async function readImportUpload(
  request: Request
): Promise<ImportUpload | Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonError(400, "A multipart form with a `file` part is required");
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Invalid multipart form data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError(400, "A timeline bundle file is required");
  }
  const projectId = form.get("project_id");
  const name = form.get("name");
  const upload: ImportUpload = {
    zipBytes: new Uint8Array(await file.arrayBuffer()),
    projectId:
      typeof projectId === "string" && projectId !== ""
        ? projectId
        : DEFAULT_PROJECT_ID
  };
  if (typeof name === "string" && name !== "") {
    upload.name = name;
  }
  return upload;
}

const timelinesRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;
  const userIdOf = (request: Request): string =>
    getUserId(request, apiOptions.userIdHeader ?? "x-user-id");

  // Registered before the parametric route so `import-zip` is never read as a
  // timeline id.
  app.post("/api/timelines/import-zip", async (req, reply) => {
    await bridge(req, reply, async (request) => {
      const userId = userIdOf(request);
      const upload = await readImportUpload(request);
      if (upload instanceof Response) {
        return upload;
      }

      let result: Awaited<ReturnType<typeof importTimelineBundle>>;
      try {
        result = await importTimelineBundle(upload.zipBytes, {
          storeAsset: async ({ bytes, name, contentType }) => {
            const asset = await createAssetModelInterface({
              userId,
              name,
              contentType,
              content: bytes
            });
            return { assetId: asset.id };
          }
        });
      } catch (error) {
        return jsonError(
          400,
          `Invalid bundle: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      const doc: TimelineDocument = {
        tracks: result.timeline.tracks,
        clips: result.timeline.clips,
        markers: result.timeline.markers,
        transcript: result.timeline.transcript ?? []
      };
      if (result.timeline.scriptEnabled !== undefined) {
        doc.scriptEnabled = result.timeline.scriptEnabled;
      }
      // Import always creates a new sequence, like the workflow bundle and the
      // list panel's Duplicate — it never overwrites an existing one.
      const seq = new TimelineSequence({
        user_id: userId,
        project_id: upload.projectId,
        name: upload.name ?? result.timeline.name,
        fps: result.timeline.fps,
        width: result.timeline.width,
        height: result.timeline.height,
        // Carried as written: a workflow id means something only on the
        // exporting install, and rewriting it would invent a link that is not
        // there. The manifest lists it under `foreign_refs` for the same reason.
        workflow_id: result.timeline.workflowId ?? null
      });
      seq.fromDocument(doc);
      seq.duration_ms = timelineDocumentDurationMs(doc);
      await seq.save();

      return new Response(
        JSON.stringify({
          timeline: seq.toTimelineSequence(),
          imported: result.imported.length,
          missing: result.missing,
          checksum_mismatches: result.checksumMismatches
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
  });

  app.get("/api/timelines/:id/export-zip", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, async (request) => {
      const userId = userIdOf(request);
      const seq = await TimelineSequence.findById(id);
      // Sequences are per-user, like boards and sketches: another owner's
      // timeline is an absence, not a refusal.
      if (!seq || seq.user_id !== userId) {
        return jsonError(404, "Timeline not found");
      }
      const { bytes } = await packTimelineBundle({
        sequence: toBundledTimeline(seq),
        fetchAsset: (assetId) => fetchOwnedAsset(userId, assetId)
      });
      return zipResponse(bytes, seq.name || "timeline");
    });
  });
};

export default timelinesRoutes;
