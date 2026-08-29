/**
 * The two unauthenticated calls a deployed app's page makes.
 *
 * Deliberately plain `fetch` rather than `restFetch`: these routes take no
 * `Authorization` header, and the page has no account session to attach. The
 * deployment token in the path is the whole credential.
 */
import type {
  PublicApplication,
  PublicApplicationSession
} from "@nodetool-ai/protocol/api-schemas/applications.js";

import { BASE_URL } from "../../stores/BASE_URL";

/** Every way a link can fail reads the same, because the server answers the same. */
export class PublicAppUnavailableError extends Error {
  constructor() {
    super("This app is not available");
    this.name = "PublicAppUnavailableError";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new PublicAppUnavailableError();
  return (await response.json()) as T;
}

export const fetchPublicApplication = async (
  token: string
): Promise<PublicApplication> =>
  readJson<PublicApplication>(
    await fetch(`${BASE_URL}/api/apps/${encodeURIComponent(token)}`)
  );

export const createPublicAppSession = async (
  token: string
): Promise<PublicApplicationSession> =>
  readJson<PublicApplicationSession>(
    await fetch(
      `${BASE_URL}/api/apps/${encodeURIComponent(token)}/session`,
      { method: "POST" }
    )
  );
