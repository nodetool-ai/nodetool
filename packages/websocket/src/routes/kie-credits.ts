import type { FastifyPluginAsync } from "fastify";
import { Secret } from "@nodetool-ai/models";

const KIE_CREDITS_URL = "https://api.kie.ai/api/v1/chat/credit";

interface KieCreditsJson {
  code?: number;
  msg?: string;
  data?: unknown;
}

/** UI expects `credit_balance: { amount, currency }` (see web `formatKieCredits`). */
function normalizeKieCreditsBody(data: unknown): Record<string, unknown> {
  if (data == null || typeof data !== "object") {
    return { credit_balance: null };
  }
  const d = data as KieCreditsJson;
  if (typeof d.data === "number" && Number.isFinite(d.data)) {
    return {
      credit_balance: {
        amount: d.data,
        currency: "credits",
      },
    };
  }
  return { credit_balance: null };
}

function kieErrorDetail(data: KieCreditsJson, httpStatus: number): string {
  const msg = typeof data.msg === "string" ? data.msg.trim() : "";
  if (msg !== "") {
    return msg;
  }
  if (httpStatus === 401 || data.code === 401) {
    return "Unauthorized. Check KIE_API_KEY in settings.";
  }
  if (httpStatus === 402 || data.code === 402) {
    return "Insufficient credits on your kie.ai account.";
  }
  return "KIE account credits could not be loaded. Check KIE_API_KEY in settings.";
}

const kieCreditsRoute: FastifyPluginAsync = async (app) => {
  app.get("/api/kie/credits", async (_req, reply) => {
    const secret = await Secret.find("1", "KIE_API_KEY");
    let apiKey: string | null = null;
    if (secret) {
      try {
        apiKey = await secret.getDecryptedValue();
      } catch (err) {
        console.error("[kie-credits] decryption failed:", err);
      }
    }
    apiKey ??= process.env.KIE_API_KEY ?? null;

    if (!apiKey) {
      console.info("[kie-credits] no KIE_API_KEY (db secret or env); returning 204");
      reply.status(204).send();
      return;
    }

    try {
      const res = await fetch(KIE_CREDITS_URL, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const raw = (await res.json().catch(() => null)) as KieCreditsJson | null;

      if (!res.ok || raw == null) {
        const body = raw != null ? JSON.stringify(raw) : "";
        console.warn("[kie-credits] kie.ai HTTP", res.status, "—", body.slice(0, 200));
        reply.send({
          unavailable: true,
          detail: raw != null ? kieErrorDetail(raw, res.status) : "KIE credits request failed.",
          credit_balance: null,
        });
        return;
      }

      if (raw.code !== undefined && raw.code !== 200) {
        console.warn("[kie-credits] kie.ai body code", raw.code, "—", raw.msg ?? "");
        reply.send({
          unavailable: true,
          detail: kieErrorDetail(raw, res.status),
          credit_balance: null,
        });
        return;
      }

      const payload = normalizeKieCreditsBody(raw);
      const bal = payload.credit_balance;
      console.info("[kie-credits] kie.ai OK", {
        has_credit_balance: bal != null,
        balance_type: bal == null ? "none" : typeof bal,
      });
      reply.send(payload);
    } catch (err) {
      console.error("[kie-credits] fetch failed:", err);
      reply.send({
        unavailable: true,
        detail: "Could not reach kie.ai. Try again later.",
        credit_balance: null,
      });
    }
  });
};

export default kieCreditsRoute;
