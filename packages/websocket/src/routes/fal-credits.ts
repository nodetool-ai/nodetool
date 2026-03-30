import type { FastifyPluginAsync } from "fastify";
import { Secret } from "@nodetool/models";

const FAL_ACCOUNT_URL = "https://api.fal.ai/v1/account";

const falCreditsRoute: FastifyPluginAsync = async (app) => {
  app.get("/api/fal/credits", async (_req, reply) => {
    const secret = await Secret.find("1", "FAL_API_KEY");
    let apiKey: string | null = null;
    if (secret) {
      try {
        apiKey = await secret.getDecryptedValue();
      } catch (err) {
        console.error("[fal-credits] decryption failed:", err);
      }
    }
    apiKey ??= process.env.FAL_API_KEY ?? null;

    if (!apiKey) {
      reply.status(204).send();
      return;
    }

    try {
      const res = await fetch(FAL_ACCOUNT_URL, {
        headers: { Authorization: `Key ${apiKey}` },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.warn("[fal-credits] HTTP", res.status, "—", body.slice(0, 200));
        reply.status(502).send({ detail: "Failed to fetch FAL credits" });
        return;
      }

      const data = await res.json();
      reply.send(data);
    } catch (err) {
      console.error("[fal-credits] fetch failed:", err);
      reply.status(502).send({ detail: "Failed to fetch FAL credits" });
    }
  });
};

export default falCreditsRoute;
