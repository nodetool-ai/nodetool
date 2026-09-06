/**
 * External MCP servers — the CRUD behind Settings → MCP Servers → "External
 * servers". A server's tools join the agent toolbelt on the next chat turn.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { McpServerConfigSchema } from "@nodetool-ai/protocol";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import {
  deleteExternalMcpServer,
  isLocalMcpProfile,
  loadExternalMcpServers,
  probeExternalMcpServer,
  saveExternalMcpServer
} from "../../external-mcp.js";

const idInput = z.object({ id: z.string().min(1) });

const probeOutput = z.object({
  id: z.string(),
  ok: z.boolean(),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional()
    })
  ),
  error: z.string().nullable()
});

export const externalMcpRouter = router({
  list: protectedProcedure
    .output(
      z.object({
        servers: z.array(McpServerConfigSchema),
        stdio_enabled: z.boolean()
      })
    )
    .query(async ({ ctx }) => ({
      servers: await loadExternalMcpServers(ctx.userId),
      stdio_enabled: isLocalMcpProfile()
    })),

  save: protectedProcedure
    .input(McpServerConfigSchema)
    .output(z.array(McpServerConfigSchema))
    .mutation(async ({ ctx, input }) => {
      try {
        return await saveExternalMcpServer(ctx.userId, input);
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }),

  delete: protectedProcedure
    .input(idInput)
    .output(z.object({ deleted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await deleteExternalMcpServer(ctx.userId, input.id);
      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
      }
      return { deleted };
    }),

  /** Connect once and list what the server offers. */
  probe: protectedProcedure
    .input(McpServerConfigSchema)
    .output(probeOutput)
    .mutation(async ({ ctx, input }) => {
      const probe = await probeExternalMcpServer(ctx.userId, input);
      const tools = probe.tools.map((t) => {
        const tool: { name: string; description?: string } = { name: t.name };
        if (t.description !== undefined) tool.description = t.description;
        return tool;
      });
      return { ...probe, tools };
    })
});
