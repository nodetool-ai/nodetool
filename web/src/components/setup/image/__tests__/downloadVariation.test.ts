/**
 * @jest-environment jsdom
 */
jest.mock("../../../../utils/resolveMediaUri", () => ({
  resolveMediaUri: jest.fn()
}));

import { resolveMediaUri } from "../../../../utils/resolveMediaUri";
import { downloadVariation } from "../ContactSheet";

const resolve = resolveMediaUri as jest.MockedFunction<typeof resolveMediaUri>;

describe("downloadVariation", () => {
  const originalFetch = global.fetch;
  let clicked: HTMLAnchorElement | null = null;

  beforeEach(() => {
    clicked = null;
    URL.createObjectURL = jest.fn(() => "blob:variation");
    URL.revokeObjectURL = jest.fn();
    jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {
        clicked = document.body.querySelector("a");
      });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("names the file after the picture's real type", async () => {
    resolve.mockResolvedValue("https://storage.test/a" as never);
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(["x"], { type: "image/jpeg" })
    })) as unknown as typeof fetch;

    await downloadVariation("a", "Variation 1");

    expect(clicked?.download).toBe("variation-1.jpg");
    expect(clicked?.href).toBe("blob:variation");
  });

  it("throws when the picture cannot be found, so the tile can say so", async () => {
    resolve.mockResolvedValue("" as never);

    await expect(downloadVariation("a", "Variation 1")).rejects.toThrow(
      "Its file could not be found."
    );
    expect(clicked).toBeNull();
  });
});
