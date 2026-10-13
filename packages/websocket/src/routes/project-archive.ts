/**
 * Project file download and upload —
 *   `GET  /api/projects/:id/export`  a `.nodetool-project` zip of the project
 *   `POST /api/projects/import`      a multipart upload that becomes a new project
 *
 * Projects are read and written over `/trpc/projects.*`; these are the
 * non-tRPC doors because the download is a binary archive and the upload is
 * multipart. Both go through `lib/project-archive.ts`, so a file written here
 * imports through the CLI and the other way round.
 */

import type { FastifyPluginAsync } from "fastify";
import { Project } from "@nodetool-ai/models";
import { bridge, streamedResponse } from "../lib/bridge.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";
import {
  importProjectArchive,
  MAX_PROJECT_ARCHIVE_BYTES,
  PROJECT_ARCHIVE_EXTENSION,
  ProjectArchiveError,
  writeProjectArchive
} from "../lib/project-archive.js";
import { projectArchiveHost } from "../lib/project-archive-host.js";
import { streamZip } from "../lib/zip-stream.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

function jsonError(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function downloadName(name: string): string {
  return (name || "project").replace(/[^A-Za-z0-9._-]+/g, "_") || "project";
}

const projectArchiveRoutes: FastifyPluginAsync<RouteOptions> = async (
  app,
  opts
) => {
  const userIdOf = (request: Request): string =>
    getUserId(request, opts.apiOptions.userIdHeader ?? "x-user-id");

  // Registered before the parametric route so `import` is never read as an id.
  app.post(
    "/api/projects/import",
    { bodyLimit: MAX_PROJECT_ARCHIVE_BYTES },
    async (req, reply) => {
      await bridge(req, reply, async (request) => {
        const userId = userIdOf(request);
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
          return jsonError(400, "A project file is required");
        }
        const name = form.get("name");
        try {
          const result = await importProjectArchive(
            new Uint8Array(await file.arrayBuffer()),
            {
              userId,
              name: typeof name === "string" ? name : undefined,
              ...projectArchiveHost()
            }
          );
          return new Response(
            JSON.stringify({
              project: result.project.toResponse(),
              counts: result.counts,
              missing: result.missing,
              checksum_mismatches: result.checksumMismatches,
              skipped: result.skipped
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        } catch (error) {
          if (error instanceof ProjectArchiveError) {
            return jsonError(400, `Invalid project file: ${error.message}`);
          }
          throw error;
        }
      });
    }
  );

  app.get("/api/projects/:id/export", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, async (request) => {
      const userId = userIdOf(request);
      const project = await Project.findOwned(userId, id);
      if (!project) return jsonError(404, "Project not found");
      const body = streamZip(async (writer) => {
        await writeProjectArchive(
          {
            userId,
            projectId: project.id,
            ...projectArchiveHost()
          },
          writer
        );
      });
      return streamedResponse(body, {
        status: 200,
        headers: {
          "content-type": "application/zip",
          "content-disposition": `attachment; filename="${downloadName(project.name)}${PROJECT_ARCHIVE_EXTENSION}"`,
          "cache-control": "no-store"
        }
      });
    });
    // A streamed body is still being sent when bridge returns.
    return reply;
  });
};

export default projectArchiveRoutes;
