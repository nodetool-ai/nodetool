/**
 * The web Jest environment decodes `data:` images and fetches nothing else.
 *
 * With `resources: "usable"`, jsdom fetched every remote image a suite
 * rendered, which billed Supabase egress for preset previews on every test
 * run. With jsdom's no-op loader, a `data:` image never fires `load`, so code
 * that decodes one through `<img>` timed out. `web/jest.environment.cjs`
 * keeps both behaviors correct.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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
    server = createServer((_req, res) => {
      requests += 1;
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("decodes a data: image locally", async () => {
    const { event, image } = await settle(PIXEL);
    expect(event).toBe("load");
    expect(image.naturalWidth).toBe(1);
    expect(image.naturalHeight).toBe(1);
  });

  it("fails a remote image without sending a request", async () => {
    const { event } = await settle(`${origin}/preset-previews/a.png`);
    expect(event).toBe("error");
    expect(requests).toBe(0);
  });

  it("fails a relative image without sending a request", async () => {
    const { event } = await settle("missing.png");
    expect(event).toBe("error");
  });
});
