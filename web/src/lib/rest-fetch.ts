import { authHeader } from "./auth";
import { isLocalhost } from "./env";
import { BASE_URL } from "../stores/BASE_URL";

export async function restFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);

  if (!isLocalhost) {
    const authHeaders = await authHeader();
    Object.entries(authHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
  }

  const url =
    typeof input === "string"
      ? `${BASE_URL}${input}`
      : input instanceof URL
        ? input
        : input;

  return fetch(url, {
    ...init,
    headers
  });
}
