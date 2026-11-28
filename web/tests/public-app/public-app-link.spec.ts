/**
 * A deployed mini app, opened from its public link by someone with no account.
 *
 * Global setup deployed the Echo app on a production-mode server. Each test
 * here starts from a fresh browser context: no cookies, no stored token. The
 * visitor must be able to load and run the app, and the session the link
 * mints must reach nothing but that app.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { PUBLIC_APP_TOKEN_ENV } from "./constants";

function deployedToken(): string {
  const token = process.env[PUBLIC_APP_TOKEN_ENV];
  if (!token) {
    throw new Error(`${PUBLIC_APP_TOKEN_ENV} is unset: global setup did not deploy the app`);
  }
  return token;
}

/** Status of one tRPC query, optionally with a bearer token. */
async function trpcStatus(
  request: APIRequestContext,
  path: string,
  bearer?: string
): Promise<number> {
  const response = await request.post(`/trpc/${path}?batch=1`, {
    data: { 0: {} },
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {}
  });
  return response.status();
}

test("a visitor with no account runs the app from its public link", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // The page shell loads with the rest of the app, so it may ask for owner
  // data. Every such call has to be refused.
  const answered: string[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/trpc/") && response.status() < 400) {
      answered.push(`${url.pathname} ${response.status()}`);
    }
  });

  await page.goto(`/a/${deployedToken()}`);

  const input = page.getByRole("textbox").first();
  await expect(input).toBeVisible();
  await input.fill("hello from a stranger");
  await page.getByRole("button", { name: "Run echo" }).click();

  await expect(page.getByText("hello from a stranger", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Your result appears here")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(answered, "tRPC calls the visitor's browser got an answer to").toEqual([]);
});

test("a link that was never minted shows the unavailable page", async ({ page }) => {
  await page.goto("/a/not-a-real-token");
  await expect(page.getByText(/not available/i).first()).toBeVisible();
});

test("the visitor's session reaches nothing but the app", async ({ request }) => {
  const token = deployedToken();
  const session = await request.post(`/api/apps/${token}/session`, { data: {} });
  expect(session.status()).toBe(200);
  const { token: sessionToken } = (await session.json()) as { token: string };
  expect(sessionToken).toMatch(/^nda_/);

  // The owner's library stays closed, with or without the link's session.
  for (const path of ["workflows.list", "applications.list", "assets.list", "settings.list"]) {
    expect(await trpcStatus(request, path), `${path} without a token`).toBe(401);
    expect(
      await trpcStatus(request, path, sessionToken),
      `${path} with the link's session`
    ).toBeGreaterThanOrEqual(401);
  }
  const workflows = await request.get("/api/workflows", {
    headers: { authorization: `Bearer ${sessionToken}` }
  });
  expect(workflows.status()).toBeGreaterThanOrEqual(401);
  expect(workflows.status()).toBeLessThan(500);
});
