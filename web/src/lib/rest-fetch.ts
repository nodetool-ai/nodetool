import { authHeader } from "./auth";
import { isAuthRequired } from "./runtimeConfig";
import { BASE_URL } from "../stores/BASE_URL";
import { isString } from "../utils/typePredicates";

export async function restFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);

  if (isAuthRequired()) {
    const authHeaders = await authHeader();
    Object.entries(authHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
  }

  const url = isString(input) ? `${BASE_URL}${input}` : input;

  return fetch(url, {
    ...init,
    headers
  });
}
