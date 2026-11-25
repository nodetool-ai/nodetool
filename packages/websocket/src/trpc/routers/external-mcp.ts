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
  externalMcpAccessForUser,
  isLocalMcpAllowedFor,
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

const catalogOutput = z.object({
  servers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      error: z.string().nullable(),
      tools: z.array(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          input_schema: z.record(z.string(), z.unknown())
        })
      )
    })
  )
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
      stdio_enabled: await isLocalMcpAllowedFor(ctx.userId)
    })),

  /**
   * The servers a workflow node may call and what each offers, for the Call
   * MCP Tool pickers. Only servers this user may connect to on this host.
   */
  catalog: protectedProcedure.output(catalogOutput).query(async ({ ctx }) => {
    const access = externalMcpAccessForUser(ctx.userId);
    const servers = await Promise.all(
      (await access.servers()).map(async ({ id, name }) => {
        try {
          const tools = (await access.tools(id)).map((t) => ({
            name: t.name,
            ...(t.description !== undefined && { description: t.description }),
            input_schema: { ...t.inputSchema }
          }));
          return { id, name, error: null, tools };
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          return { id, name, error: error.split("\n")[0].slice(0, 200), tools: [] };
        }
      })
    );
    return { servers };
  }),

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
