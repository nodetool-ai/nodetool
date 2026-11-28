/** Shared by the public app suite's config, global setup and spec. */

export const PUBLIC_APP_BACKEND_PORT = Number(
  process.env.PUBLIC_APP_BACKEND_PORT ?? 7787
);
export const PUBLIC_APP_WEB_PORT = Number(
  process.env.PUBLIC_APP_WEB_PORT ?? 3017
);

/** The owner's bearer token. Test-only, and only the owner's requests carry it. */
export const OWNER_TOKEN = "public-app-owner-token-test-only-0123456789";

/** Where global setup leaves the deployed link's token for the tests. */
export const PUBLIC_APP_TOKEN_ENV = "PUBLIC_APP_TOKEN";

export function backendUrl(): string {
  return `http://127.0.0.1:${PUBLIC_APP_BACKEND_PORT}`;
}
