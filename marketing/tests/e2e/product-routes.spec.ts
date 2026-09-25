import { expect, test } from "@playwright/test";

const routes = [
  {
    path: "/studio",
    heading: "Make the work. Keep the project.",
    primary: /Download Studio/,
  },
  {
    path: "/cloud",
    heading: "The NodeTool workspace. In your browser.",
    primary: "Try Cloud (alpha)",
  },
  {
    path: "/agents",
    heading: "Agents that work in real editors.",
    primary: /Download Studio/,
  },
];

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    for (const route of routes) {
      test(`${route.path} identifies its purpose and action`, async ({ page }) => {
        await page.goto(route.path, { waitUntil: "load" });

        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expect(
          page.getByRole("heading", { level: 1, name: route.heading })
        ).toBeVisible();
        await expect(page.getByRole("link", { name: route.primary }).first()).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth
          )
        ).toBe(true);
      });
    }
  });
}

test("Cloud is labeled as alpha at shared entry points", async ({ page }) => {
  await page.goto("/cloud", { waitUntil: "load" });

  await expect(page.getByRole("link", { name: "Cloud (alpha)" }).first()).toBeVisible();
  await expect(page.getByText("NodeTool Cloud · Alpha preview")).toBeVisible();
  await expect(page.getByRole("link", { name: "Try Cloud (alpha)" }).first()).toBeVisible();
});

test("the redesigned routes do not use gradient headline text", async ({ page }) => {
  for (const route of ["/", "/cloud", "/studio", "/agents"]) {
    await page.goto(route, { waitUntil: "load" });
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveCount(1);
    expect(
      await heading.evaluate((element) =>
        Boolean(element.querySelector(".text-transparent, .gradient-text"))
      )
    ).toBe(false);
  }
});
