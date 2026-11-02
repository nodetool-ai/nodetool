/**
 * The web Jest environment decodes `data:` images, serves loopback hosts, and
 * fetches nothing else.
 *
 * With `resources: "usable"`, jsdom fetched every remote image a suite
 * rendered, which billed Supabase egress for preset previews on every test
 * run. With jsdom's no-op loader, a `data:` image never fires `load`, so code
 * that decodes one through `<img>` timed out. `web/jest.environment.cjs`
 * keeps both behaviors correct.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { LocalOnlyResourceLoader } = require("../../jest.environment.cjs") as {
  LocalOnlyResourceLoader: new () => { fetch: (url: string) => Promise<Buffer> };
};

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PREVIEW =
  "https://example.supabase.co/storage/v1/object/public/preset-previews/a.png";

const settle = (src: string): Promise<{ event: string; image: HTMLImageElement }> =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ event: "load", image });
    image.onerror = () => resolve({ event: "error", image });
    image.src = src;
  });

describe("web Jest environment", () => {
  let server: Server;
  let requests = 0;
  let origin = "";

  beforeAll(async () => {
    const png = readFileSync(join(process.cwd(), "public", "favicon-16x16.png"));
    server = createServer((_req, res) => {
      requests += 1;
      res.writeHead(200, { "Content-Type": "image/png" }).end(png);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("decodes a data: image locally", async () => {
    const { event, image } = await settle(PIXEL);
    expect(event).toBe("load");
    expect(image.naturalWidth).toBe(1);
  });

  it("loads an image from a loopback server", async () => {
    const before = requests;
    const { event, image } = await settle(`${origin}/thumb.png`);
    expect(event).toBe("load");
    expect(image.naturalWidth).toBe(16);
    expect(requests).toBe(before + 1);
  });

  it("fails a remote image in the loader, before any request", async () => {
    const reported = jest.spyOn(console, "error").mockImplementation(() => {});
    const { event } = await settle(PREVIEW);
    expect(event).toBe("error");
    const [reportedError] = reported.mock.calls[0] as [{ detail?: Error }];
    expect(reportedError.detail?.message).toBe(`jsdom does not fetch ${PREVIEW} in unit tests`);
  });

  it("rejects remote URLs without delegating to jsdom's HTTP client", async () => {
    await expect(new LocalOnlyResourceLoader().fetch(PREVIEW)).rejects.toThrow(
      `jsdom does not fetch ${PREVIEW} in unit tests`
    );
  });
});
