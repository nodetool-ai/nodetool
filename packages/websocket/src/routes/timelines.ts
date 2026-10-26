/**
 * Timeline zip download and upload —
 *   `GET  /api/timelines/:id/export-zip`
 *   `GET  /api/timelines/:id/export-premiere`
 *   `GET  /api/timelines/:id/export-media`
 *   `POST /api/timelines/import-zip` (a NodeTool bundle or a Premiere XML zip)
 *
 * The web app reads and writes sequences over `/trpc/timeline.*`; these are the
 * non-tRPC doors, because the responses are binary archives and the upload is
 * multipart. The bundle pair goes through `lib/timeline-bundle.ts`, so a bundle
 * written here imports anywhere. The Premiere export goes through
 * `lib/timeline-premiere.ts`, the media export through
 * `lib/timeline-media-export.ts`.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import type { FastifyPluginAsync } from "fastify";
import type { InterchangeSequence } from "@nodetool-ai/timeline";
import { timelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  Asset,
  TimelineSequence,
  timelineDocumentDurationMs,
  type TimelineDocument
} from "@nodetool-ai/models";
import { bridge, streamedResponse } from "../lib/bridge.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";
import { resolveAssetExportSource } from "../lib/asset-export.js";
import { createAssetModelInterface } from "../lib/asset-model-interface.js";
import {
  importTimelineBundle,
  unzipBounded,
  writeTimelineBundle,
  zipEntryNames,
  type BundledTimeline
} from "../lib/timeline-bundle.js";
import {
  findPremiereXml,
  importPremiereArchive
} from "../lib/timeline-premiere-import.js";
import { planMediaExport, writeMediaExport } from "../lib/timeline-media-export.js";
import {
  planPremiereExport,
  writePremiereExport,
  type PremiereFetchedAsset,
  type PremiereMediaInfo
} from "../lib/timeline-premiere.js";
import { probeDurationMs, probeHasAudio } from "../lib/media.js";
import { isLocalFileSource, streamZip, type ExportSource } from "../lib/zip-stream.js";

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

/** The source for one asset the caller owns, or null when the row or object is gone. */
async function fetchOwnedAsset(
  userId: string,
  assetId: string
): Promise<PremiereFetchedAsset | null> {
  const asset = (await Asset.get(assetId)) as Asset | null;
  // Another owner's asset is an absence here, not a refusal: a clip can name an
  // id that is not the caller's, and an export must not copy those bytes out.
  if (!asset || asset.user_id !== userId) {
    return null;
  }
  // A local file is streamed from disk; only a store with no local file
  // hands over bytes.
  const source = await resolveAssetExportSource(asset);
  if (!source) {
    return null;
  }
  const fetched: PremiereFetchedAsset = {
    source,
    name: asset.name,
    contentType: asset.content_type
  };
  if (typeof asset.duration === "number" && asset.duration > 0) {
    fetched.durationMs = Math.round(asset.duration * 1000);
  }
  return fetched;
}

/**
 * Duration and audio presence of one export source. Bytes from a store with
 * no local file are probed from a temporary copy. A file the probe cannot
 * read leaves both unknown, and the export report says what that left out.
 */
async function probeExportSource(
  source: ExportSource,
  contentType: string
): Promise<PremiereMediaInfo> {
  const isVideo = contentType.startsWith("video/");
  if (!isVideo && !contentType.startsWith("audio/")) return {};
  let dir: string | null = null;
  try {
    let path: string;
    if (isLocalFileSource(source)) {
      path = source.path;
    } else {
      dir = await mkdtemp(nodePath.join(tmpdir(), "nodetool-premiere-"));
      path = nodePath.join(dir, "media");
      await writeFile(path, source);
    }
    const info: PremiereMediaInfo = {};
    const durationMs = await probeDurationMs(path);
    if (durationMs !== null) info.durationMs = durationMs;
    if (isVideo) info.hasAudio = await probeHasAudio(path);
    return info;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
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

/** The sequence as the interchange writers read it. */
function toInterchangeSequence(seq: TimelineSequence): InterchangeSequence {
  const wire = seq.toTimelineSequence();
  return {
    name: wire.name,
    width: wire.width,
    height: wire.height,
    fps: wire.fps,
    tracks: wire.tracks,
    clips: wire.clips,
    markers: wire.markers
  } as InterchangeSequence;
}

/** `name` with everything outside `A-Za-z0-9._-` replaced, for a download. */
function downloadName(name: string): string {
  return (name || "timeline").replace(/[^A-Za-z0-9._-]+/g, "_") || "timeline";
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

/** Store one uploaded file as an asset the caller owns. */
async function storeOwnedAsset(
  userId: string,
  file: { bytes: Uint8Array; name: string; contentType: string }
): Promise<{ assetId: string }> {
  const asset = await createAssetModelInterface({
    userId,
    name: file.name,
    contentType: file.contentType,
    content: file.bytes
  });
  return { assetId: asset.id };
}

/** A new timeline from a zip holding a Premiere Pro XML and its media. */
async function importPremiereUpload(
  upload: ImportUpload,
  userId: string
): Promise<Response> {
  let result: Awaited<ReturnType<typeof importPremiereArchive>>;
  try {
    const entries = unzipBounded(upload.zipBytes);
    const xml = findPremiereXml(entries);
    if (!xml) {
      return jsonError(
        400,
        "Invalid bundle: the zip holds neither a NodeTool timeline (manifest.json) nor a Premiere Pro XML sequence"
      );
    }
    result = await importPremiereArchive(xml, entries, {
      storeAsset: (file) => storeOwnedAsset(userId, file)
    });
  } catch (error) {
    return jsonError(
      400,
      `Invalid Premiere XML: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const { timeline } = result;
  // The same schema gate the bundle import and the tRPC update apply.
  const parsed = timelineDocument.safeParse({
    tracks: timeline.tracks,
    clips: timeline.clips,
    markers: timeline.markers,
    transcript: []
  });
  if (!parsed.success) {
    return jsonError(400, `Invalid Premiere XML: ${parsed.error.message}`);
  }
  const doc: TimelineDocument = parsed.data;
  const seq = new TimelineSequence({
    user_id: userId,
    project_id: upload.projectId,
    name: upload.name ?? timeline.name,
    fps: timeline.fps,
    width: timeline.width,
    height: timeline.height,
    workflow_id: null
  });
  seq.fromDocument(doc);
  seq.duration_ms = timelineDocumentDurationMs(doc);
  await seq.save();
  return new Response(
    JSON.stringify({
      timeline: seq.toTimelineSequence(),
      imported: result.imported.length,
      missing: [],
      checksum_mismatches: [],
      format: "premiere_xml",
      missing_clips: timeline.missingClips,
      warnings: timeline.warnings
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
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

      let names: string[];
      try {
        names = zipEntryNames(upload.zipBytes);
      } catch (error) {
        return jsonError(
          400,
          `Invalid bundle: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      // A NodeTool bundle carries a manifest; a zip without one may hold a
      // Premiere Pro (xmeml) sequence and its media instead.
      if (!names.includes("manifest.json")) {
        return importPremiereUpload(upload, userId);
      }

      let result: Awaited<ReturnType<typeof importTimelineBundle>>;
      try {
        result = await importTimelineBundle(upload.zipBytes, {
          storeAsset: ({ bytes, name, contentType }) =>
            storeOwnedAsset(userId, { bytes, name, contentType })
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
      const sequence = toBundledTimeline(seq);
      // The archive streams as it is written, so neither an asset nor the
      // zip is ever held in memory whole.
      const body = streamZip(async (writer) => {
        await writeTimelineBundle(
          {
            sequence,
            fetchAsset: (assetId) => fetchOwnedAsset(userId, assetId)
          },
          writer
        );
      });
      const safe =
        (seq.name || "timeline").replace(/[^A-Za-z0-9._-]+/g, "_") ||
        "timeline";
      return streamedResponse(body, {
        status: 200,
        headers: {
          "content-type": "application/zip",
          "content-disposition": `attachment; filename="${safe}.zip"`,
          "cache-control": "no-store"
        }
      });
    });
    // A streamed body is still being sent when bridge returns.
    return reply;
  });

  app.get("/api/timelines/:id/export-premiere", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, async (request) => {
      const userId = userIdOf(request);
      const seq = await TimelineSequence.findById(id);
      if (!seq || seq.user_id !== userId) {
        return jsonError(404, "Timeline not found");
      }
      const sequence = toInterchangeSequence(seq);
      // Probing happens before the first byte goes out, so the headers can
      // carry the warning count and a failure is still a plain error.
      const plan = await planPremiereExport({
        sequence,
        fetchAsset: (assetId) => fetchOwnedAsset(userId, assetId),
        probe: probeExportSource
      });
      const body = streamZip((writer) =>
        writePremiereExport(sequence.name, plan, writer)
      );
      return streamedResponse(body, {
        status: 200,
        headers: {
          "content-type": "application/zip",
          "content-disposition": `attachment; filename="${downloadName(seq.name)}-premiere.zip"`,
          "cache-control": "no-store",
          "x-nodetool-export-warnings": String(plan.report.warnings.length)
        }
      });
    });
    return reply;
  });

  app.get("/api/timelines/:id/export-media", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, async (request) => {
      const userId = userIdOf(request);
      const seq = await TimelineSequence.findById(id);
      if (!seq || seq.user_id !== userId) {
        return jsonError(404, "Timeline not found");
      }
      const plan = await planMediaExport({
        sequence: toInterchangeSequence(seq),
        fetchAsset: (assetId) => fetchOwnedAsset(userId, assetId)
      });
      const body = streamZip((writer) => writeMediaExport(plan, writer));
      return streamedResponse(body, {
        status: 200,
        headers: {
          "content-type": "application/zip",
          "content-disposition": `attachment; filename="${downloadName(seq.name)}-media.zip"`,
          "cache-control": "no-store",
          "x-nodetool-export-missing": String(plan.missing.length)
        }
      });
    });
    return reply;
  });
};

export default timelinesRoutes;
