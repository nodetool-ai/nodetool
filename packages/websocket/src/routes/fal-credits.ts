import type { FastifyPluginAsync } from "fastify";
import { Secret } from "@nodetool-ai/models";

/** Platform API billing + credits (GET /v1/account was removed — returns 404). */
const FAL_ACCOUNT_BILLING_URL =
  "https://api.fal.ai/v1/account/billing?expand=credits";

interface FalBillingJson {
  username?: string;
  credits?: {
    current_balance: number;
    currency: string;
  };
  credit_balance?: unknown;
}

/** Extract `error.message` from fal.ai JSON error bodies (403 admin key, etc.). */
function parseFalApiErrorMessage(body: string): string | undefined {
  try {
    const j = JSON.parse(body) as { error?: { message?: string } };
    const msg = j.error?.message;
    if (typeof msg === "string" && msg.trim() !== "") {
      return msg.trim();
    }
  } catch {
    // not JSON
  }
  return undefined;
}

/** UI expects `credit_balance: { amount, currency }` (see web `formatCredits`). */
function normalizeFalCreditsBody(data: unknown): Record<string, unknown> {
  if (data == null || typeof data !== "object") {
    return { credit_balance: null };
  }
  const d = data as FalBillingJson;
  if (
    d.credits != null &&
    typeof d.credits.current_balance === "number"
  ) {
    return {
      credit_balance: {
        amount: d.credits.current_balance,
        currency: d.credits.currency ?? "USD",
      },
      username: d.username,
    };
  }
  if (d.credit_balance != null) {
    return { ...d } as Record<string, unknown>;
  }
  return { credit_balance: null, username: d.username };
}

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
      console.info("[fal-credits] no FAL_API_KEY (db secret or env); returning 204");
      reply.status(204).send();
      return;
    }

    try {
      const res = await fetch(FAL_ACCOUNT_BILLING_URL, {
        headers: { Authorization: `Key ${apiKey}` },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.warn("[fal-credits] fal.ai HTTP", res.status, "—", body.slice(0, 200));
        console.info(
          "[fal-credits] forwarding unavailable payload to client (HTTP 200)",
        );
        const fromFal = parseFalApiErrorMessage(body);
        const detail =
          fromFal ??
          (res.status === 403
            ? "Access denied. Account billing on fal.ai requires an Admin API key — create one at https://fal.ai/dashboard/keys"
            : undefined) ??
          "FAL account could not be loaded. Check FAL_API_KEY in settings.";
        // 200 so the SPA does not treat this as a gateway error in devtools; body is explicit.
        reply.send({
          unavailable: true,
          detail,
          credit_balance: null,
        });
        return;
      }

      const raw = await res.json();
      const payload = normalizeFalCreditsBody(raw);
      const bal = payload.credit_balance;
      console.info("[fal-credits] fal.ai billing OK", {
        has_credit_balance: bal != null,
        balance_type: bal == null ? "none" : typeof bal,
      });
      reply.send(payload);
    } catch (err) {
      console.error("[fal-credits] fetch failed:", err);
      console.info("[fal-credits] forwarding unavailable payload to client (network error)");
      reply.send({
        unavailable: true,
        detail: "Could not reach FAL. Try again later.",
        credit_balance: null,
      });
    }
  });
};

export default falCreditsRoute;
