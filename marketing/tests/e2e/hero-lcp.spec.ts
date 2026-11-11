import { expect, test } from "@playwright/test";

// Search Console flagged mobile LCP over 2.5 s for the home page group. The
// cause was the hero reel: once the video faded in, Chrome reported its first
// frame as a new LCP candidate because it measured a few pixels larger than
// the poster, so LCP moved from the poster to the moment the video started.
// Whether Chrome reports it depends on paint timing, so the box check is the
// deterministic guard and the observed candidates are the end-to-end one.
for (const route of ["/", "/alternatives/comfyui"]) {
  test(`${route}: the hero reel never becomes the LCP element`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 823 });
    await page.addInitScript(() => {
      const entries: string[] = [];
      (window as unknown as { __lcp: string[] }).__lcp = entries;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const element = (entry as PerformanceEntry & { element?: Element })
            .element;
          entries.push(element?.tagName ?? "");
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    await page.goto(route);

    const video = page.locator(".hero-demo video");
    await expect
      .poll(
        () =>
          video.evaluate(
            (node: HTMLVideoElement) =>
              node.currentTime > 0.5 && getComputedStyle(node).opacity === "1"
          ),
        { timeout: 20_000 }
      )
      .toBe(true);

    const [posterArea, videoArea] = await page.evaluate(() => {
      const area = (selector: string) => {
        const rect = document
          .querySelector(selector)
          ?.getBoundingClientRect();
        return rect ? rect.width * rect.height : 0;
      };
      return [area(".hero-demo img"), area(".hero-demo video")];
    });
    expect(posterArea).toBeGreaterThan(0);
    expect(videoArea).toBeLessThan(posterArea);

    const candidates = await page.evaluate(
      () => (window as unknown as { __lcp: string[] }).__lcp
    );
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates).not.toContain("VIDEO");
  });
}
