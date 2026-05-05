/**
 * Timeline REST routes.
 *
 * Endpoints:
 *   GET    /api/timeline?projectId=…          → TimelineSequenceListItem[]
 *   POST   /api/timeline                      → TimelineSequenceResponse
 *   GET    /api/timeline/:id                  → TimelineSequenceResponse
 *   PATCH  /api/timeline/:id                  → TimelineSequenceResponse
 *   DELETE /api/timeline/:id                  → 204
 *   GET    /api/timeline/:id/clips/:clipId/versions → ClipVersion[]
 *   POST   /api/timeline/:id/clips/:clipId/versions → ClipVersion
 */

import type { FastifyPluginAsync } from "fastify";
import { TimelineSequence } from "@nodetool-ai/models";
import { createTimeOrderedUuid } from "@nodetool-ai/models";
import type { TimelineDocument } from "@nodetool-ai/models";
import type { ClipVersion } from "@nodetool-ai/timeline";
import { z } from "zod";

interface RouteOptions {
  // intentionally empty – no apiOptions needed for timeline routes
}

const createInput = z.object({
  name: z.string().min(1),
  projectId: z.string().min(1),
  fps: z.number().int().min(1).optional().default(30),
  width: z.number().int().min(1).optional().default(1920),
  height: z.number().int().min(1).optional().default(1080)
});

const patchInput = z.object({
  name: z.string().min(1).optional(),
  fps: z.number().int().min(1).optional(),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
  document: z
    .object({
      tracks: z.array(z.unknown()),
      clips: z.array(z.unknown()),
      markers: z.array(z.unknown())
    })
    .optional()
});

const appendVersionInput = z.object({
  jobId: z.string(),
  assetId: z.string(),
  dependencyHash: z.string(),
  workflowUpdatedAt: z.string(),
  paramOverridesSnapshot: z.record(z.string(), z.unknown()).optional(),
  costCredits: z.number().optional(),
  durationMs: z.number().optional(),
  status: z.enum(["success", "failed", "cancelled"]).optional().default("success")
});

function serializeSeq(seq: TimelineSequence): unknown {
  return seq.toTimelineSequence();
}

function serializeListItem(seq: TimelineSequence): unknown {
  return {
    id: seq.id,
    projectId: seq.project_id,
    name: seq.name,
    updatedAt: seq.updated_at
  };
}

const timelineRoutes: FastifyPluginAsync<RouteOptions> = async (app) => {
  // ── GET /api/timeline?projectId=… ───────────────────────────────────
  app.get("/api/timeline", async (req, reply) => {
    const userId = req.userId;
    if (!userId) return reply.status(401).send({ detail: "Unauthorized" });
    const { projectId } = req.query as Record<string, string | undefined>;

    let seqs: TimelineSequence[];
    if (projectId) {
      seqs = await TimelineSequence.listByProject(projectId);
      // Only return sequences belonging to the authenticated user
      seqs = seqs.filter((s) => s.user_id === userId);
    } else {
      seqs = await TimelineSequence.listByUser(userId);
    }

    return reply.send(seqs.map(serializeListItem));
  });

  // ── POST /api/timeline ──────────────────────────────────────────────
  app.post("/api/timeline", async (req, reply) => {
    const userId = req.userId;
    if (!userId) return reply.status(401).send({ detail: "Unauthorized" });
    const parsed = createInput.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ detail: "Invalid request body", issues: parsed.error.issues });
    }
    const { name, projectId, fps, width, height } = parsed.data;
    const seq = new TimelineSequence({
      user_id: userId,
      project_id: projectId,
      name,
      fps,
      width,
      height
    });
    await seq.save();
    return reply.status(201).send(serializeSeq(seq));
  });

  // ── GET /api/timeline/:id ───────────────────────────────────────────
  app.get("/api/timeline/:id", async (req, reply) => {
    const userId = req.userId;
    if (!userId) return reply.status(401).send({ detail: "Unauthorized" });
    const { id } = req.params as { id: string };
    const seq = await TimelineSequence.findById(id);
    if (!seq || seq.user_id !== userId) {
      return reply.status(404).send({ detail: "Timeline sequence not found" });
    }
    return reply.send(serializeSeq(seq));
  });

  // ── PATCH /api/timeline/:id ─────────────────────────────────────────
  app.patch("/api/timeline/:id", async (req, reply) => {
    const userId = req.userId;
    if (!userId) return reply.status(401).send({ detail: "Unauthorized" });
    const { id } = req.params as { id: string };

    const seq = await TimelineSequence.findById(id);
    if (!seq || seq.user_id !== userId) {
      return reply.status(404).send({ detail: "Timeline sequence not found" });
    }

    // Optimistic concurrency: if client sends If-Match header, check it
    const ifMatchRaw = req.headers["if-match"];
    const ifMatch = Array.isArray(ifMatchRaw) ? ifMatchRaw[0] : ifMatchRaw;
    if (ifMatch !== undefined && ifMatch !== seq.updated_at) {
      return reply
        .status(409)
        .send({ detail: "Conflict: sequence has been modified" });
    }

    const parsed = patchInput.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ detail: "Invalid request body", issues: parsed.error.issues });
    }

    const { name, fps, width, height, document: docPatch } = parsed.data;

    const updateFields: Parameters<typeof TimelineSequence.update>[1] = {};
    if (name !== undefined) updateFields.name = name;
    if (fps !== undefined) updateFields.fps = fps;
    if (width !== undefined) updateFields.width = width;
    if (height !== undefined) updateFields.height = height;

    if (docPatch !== undefined) {
      // Validate document shape
      const currentDoc = seq.toDocument();
      const merged: TimelineDocument = {
        tracks:
          (docPatch.tracks as TimelineDocument["tracks"]) ?? currentDoc.tracks,
        clips:
          (docPatch.clips as TimelineDocument["clips"]) ?? currentDoc.clips,
        markers:
          (docPatch.markers as TimelineDocument["markers"]) ??
          currentDoc.markers
      };
      try {
        updateFields.document = JSON.stringify(merged);
      } catch {
        return reply.status(400).send({ detail: "Invalid document JSON" });
      }
    }

    const updated = await TimelineSequence.update(id, updateFields);
    if (!updated) {
      return reply.status(404).send({ detail: "Timeline sequence not found" });
    }
    return reply.send(serializeSeq(updated));
  });

  // ── DELETE /api/timeline/:id ────────────────────────────────────────
  app.delete("/api/timeline/:id", async (req, reply) => {
    const userId = req.userId;
    if (!userId) return reply.status(401).send({ detail: "Unauthorized" });
    const { id } = req.params as { id: string };
    const seq = await TimelineSequence.findById(id);
    if (!seq || seq.user_id !== userId) {
      return reply.status(404).send({ detail: "Timeline sequence not found" });
    }
    await seq.delete();
    return reply.status(204).send();
  });

  // ── GET /api/timeline/:id/clips/:clipId/versions ────────────────────
  app.get("/api/timeline/:id/clips/:clipId/versions", async (req, reply) => {
    const userId = req.userId;
    if (!userId) return reply.status(401).send({ detail: "Unauthorized" });
    const { id, clipId } = req.params as { id: string; clipId: string };

    const seq = await TimelineSequence.findById(id);
    if (!seq || seq.user_id !== userId) {
      return reply.status(404).send({ detail: "Timeline sequence not found" });
    }

    const doc = seq.toDocument();
    const clip = doc.clips.find((c) => c.id === clipId);
    if (!clip) {
      return reply.status(404).send({ detail: "Clip not found" });
    }

    return reply.send(clip.versions ?? []);
  });

  // ── POST /api/timeline/:id/clips/:clipId/versions ───────────────────
  app.post("/api/timeline/:id/clips/:clipId/versions", async (req, reply) => {
    const userId = req.userId;
    if (!userId) return reply.status(401).send({ detail: "Unauthorized" });
    const { id, clipId } = req.params as { id: string; clipId: string };

    const seq = await TimelineSequence.findById(id);
    if (!seq || seq.user_id !== userId) {
      return reply.status(404).send({ detail: "Timeline sequence not found" });
    }

    const parsed = appendVersionInput.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ detail: "Invalid request body", issues: parsed.error.issues });
    }

    const doc = seq.toDocument();
    const clipIndex = doc.clips.findIndex((c) => c.id === clipId);
    if (clipIndex === -1) {
      return reply.status(404).send({ detail: "Clip not found" });
    }

    const newVersion: ClipVersion = {
      id: createTimeOrderedUuid(),
      createdAt: new Date().toISOString(),
      jobId: parsed.data.jobId,
      assetId: parsed.data.assetId,
      dependencyHash: parsed.data.dependencyHash,
      workflowUpdatedAt: parsed.data.workflowUpdatedAt,
      paramOverridesSnapshot: parsed.data.paramOverridesSnapshot ?? {},
      costCredits: parsed.data.costCredits,
      durationMs: parsed.data.durationMs,
      status: parsed.data.status
    };

    const clip = doc.clips[clipIndex];
    if (!clip.versions) {
      clip.versions = [];
    }
    clip.versions.push(newVersion);

    await TimelineSequence.update(id, { document: JSON.stringify(doc) });

    return reply.status(201).send(newVersion);
  });
};

export default timelineRoutes;
