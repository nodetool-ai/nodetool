import { BASE_URL } from "../stores/BASE_URL";

/** kie.ai dashboard to manage API keys. */
export const KIE_API_KEY_URL = "https://kie.ai/api-key";

export const KIE_PRICING_URL = "https://kie.ai/pricing";

export const KIE_BILLING_URL = "https://kie.ai/billing";

/** Whether to show an API-key link for this error (skip network-only copy). */
export function kieCreditsDetailSuggestsKeysLink(
  detail: string | undefined,
): boolean {
  if (detail == null || detail.trim() === "") {
    return false;
  }
  const d = detail.toLowerCase();
  if (d.includes("reach kie") || d.includes("try again later")) {
    return false;
  }
  return true;
}

export interface KieCredits {
  credit_balance?: { amount?: number; currency?: string } | number;
  /** Set by our API when kie.ai account fetch fails (HTTP 200, avoids 502 in the browser). */
  unavailable?: boolean;
  detail?: string;
}

export function formatKieCredits(data: KieCredits): string {
  const bal = data.credit_balance;
  if (bal == null) {
    return "N/A";
  }
  let amount: number | undefined;
  if (typeof bal === "number") {
    amount = bal;
  } else if (typeof bal === "object" && typeof bal.amount === "number") {
    amount = bal.amount;
  }
  if (amount === undefined || !Number.isFinite(amount)) {
    return "N/A";
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount)} credits`;
}

export async function fetchKieCredits(): Promise<KieCredits | null> {
  const url = `${BASE_URL}/api/kie/credits`;
  try {
    const res = await fetch(url);
    if (res.status === 204) {
      console.info("[kie-credits] server 204 — no KIE_API_KEY configured on backend");
      return null;
    }
    if (!res.ok) {
      console.warn("[kie-credits] request failed", { url, status: res.status });
      return null;
    }
    const data = (await res.json()) as KieCredits;
    if (data.unavailable) {
      console.info("[kie-credits] backend returned unavailable:", data.detail ?? "");
    } else {
      console.info("[kie-credits] ok — credit display:", formatKieCredits(data));
    }
    return data;
  } catch (err) {
    console.warn("[kie-credits] fetch error", err);
    return null;
  }
}
