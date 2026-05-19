import { BASE_URL } from "../stores/BASE_URL";

/** fal.ai dashboard to create Admin API keys (billing endpoint requires admin scope). */
export const FAL_DASHBOARD_KEYS_URL = "https://fal.ai/dashboard/keys";

/** Whether to show a “manage keys” link for this error (skip for copy that is clearly network-only). */
export function falCreditsDetailSuggestsKeysLink(detail: string | undefined): boolean {
  if (detail == null || detail.trim() === "") {
    return false;
  }
  const d = detail.toLowerCase();
  if (d.includes("reach fal") || d.includes("try again later")) {
    return false;
  }
  return true;
}

export interface FalCredits {
  credit_balance?: { amount?: number; currency?: string } | number;
  /** Set by our API when fal.ai account fetch fails (HTTP 200, avoids 502 in the browser). */
  unavailable?: boolean;
  detail?: string;
}

export function formatCredits(data: FalCredits): string {
  const bal = data.credit_balance;
  if (bal == null) {
    return "N/A";
  }
  if (typeof bal === "number") {
    return `$${bal.toFixed(2)}`;
  }
  if (typeof bal === "object") {
    const amount = bal.amount;
    const currency = (bal.currency ?? "USD").toUpperCase();
    if (typeof amount === "number") {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        }).format(amount);
      } catch {
        return `${amount} ${currency}`;
      }
    }
  }
  return "N/A";
}

export async function fetchFalCredits(): Promise<FalCredits | null> {
  const url = `${BASE_URL}/api/fal/credits`;
  try {
    const res = await fetch(url);
    if (res.status === 204) {
      console.info("[fal-credits] server 204 — no FAL_API_KEY configured on backend");
      return null;
    }
    if (!res.ok) {
      console.warn("[fal-credits] request failed", { url, status: res.status });
      return null;
    }
    const data = (await res.json()) as FalCredits;
    if (data.unavailable) {
      console.info("[fal-credits] backend returned unavailable:", data.detail ?? "");
    } else {
      console.info("[fal-credits] ok — credit display:", formatCredits(data));
    }
    return data;
  } catch (err) {
    console.warn("[fal-credits] fetch error", err);
    return null;
  }
}
