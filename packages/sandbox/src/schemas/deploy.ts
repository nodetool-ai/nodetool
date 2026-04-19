import { z } from "zod";

/**
 * Deploy tools — let the agent surface a locally-running service (dev
 * server, API, generated static site) to the user via a published host URL.
 *
 * The DockerSandbox publishes a known pool of "user-service" container
 * ports at container-create time (3000, 8000, 8080 by default). The
 * `expose_port` tool is a lookup that returns the published URL for one
 * of those ports; the agent's own service must actually be listening on
 * the chosen container port for the URL to respond.
 */

export const ExposePortInput = z.object({
  port: z.number().int().positive().max(65535),
  scheme: z.enum(["http", "https"]).optional()
});
export type ExposePortInput = z.infer<typeof ExposePortInput>;

export const ExposePortOutput = z.object({
  container_port: z.number().int().positive(),
  public_url: z.string(),
  expires_at: z.number().nullable()
});
export type ExposePortOutput = z.infer<typeof ExposePortOutput>;
