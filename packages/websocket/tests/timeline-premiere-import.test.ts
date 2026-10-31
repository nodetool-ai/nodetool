import { describe, expect, it, vi } from "vitest";
import { importPremiereArchive, findPremiereXml } from "../src/lib/timeline-premiere-import.js";

function xml(paths: readonly string[]): string {
  return `<xmeml><sequence><name>cameras</name><rate><timebase>25</timebase></rate><media><video><track>${paths.map((path, index) =>
    `<clipitem id="c${index}"><name>camera${index}</name><start>${index * 25}</start><end>${(index + 1) * 25}</end><in>0</in><file id="f${index}"><name>C0001.mp4</name><pathurl>${path}</pathurl><media><video/></media></file></clipitem>`).join("")}</track></video></media></sequence></xmeml>`;
}

describe("Premiere archive media matching", () => {
  it("rejects oversized XML bytes before decoding the archive entry", () => {
    expect(() => findPremiereXml({ "cut.xml": new Uint8Array(8 * 1024 * 1024 + 1) })).toThrow(/8 MiB/);
  });

  it("leaves a large ambiguous media set missing without expanding every candidate", async () => {
    const count = 15_000;
    const files = Array.from({ length: count }, (_, index) => `<file id="f${index}"><pathurl>file://editor/clip.mp4</pathurl></file>`).join("");
    const clips = Array.from({ length: count }, (_, index) => `<clipitem><start>0</start><end>25</end><file id="f${index}"/></clipitem>`).join("");
    const source = `<xmeml><sequence><media><video>${files}<track>${clips}</track></video></media></sequence></xmeml>`;
    const entries = Object.fromEntries(Array.from({ length: 10_000 }, (_, index) => [`camera${index}/clip.mp4`, new Uint8Array([1])]));
    const storeAsset = vi.fn(async () => ({ assetId: "wrong" }));
    const started = performance.now();
    const result = await importPremiereArchive(source, entries, { storeAsset });
    expect(result.timeline.missingClips).toBe(count);
    expect(storeAsset).not.toHaveBeenCalled();
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it("matches distinct relative paths before falling back to a basename", async () => {
    const storeAsset = vi.fn(async ({ bytes }: { bytes: Uint8Array }) => ({ assetId: `asset-${bytes[0]}` }));
    const result = await importPremiereArchive(xml(["CameraA/C0001.mp4", "CameraB/C0001.mp4"]), {
      "CameraA/C0001.mp4": new Uint8Array([1]), "CameraB/C0001.mp4": new Uint8Array([2])
    }, { storeAsset });
    expect(storeAsset).toHaveBeenCalledTimes(2);
    expect(result.timeline.clips.map((clip) => clip.currentAssetId)).toEqual(["asset-1", "asset-2"]);
  });
  it.each([
    ["Audio/take.m4a", "audio/x-m4a"],
    ["Audio/take.flac", "audio/x-flac"],
    ["Video/take.mov", "video/quicktime"]
  ])("stores %s as %s", async (file, contentType) => {
    const storeAsset = vi.fn(async () => ({ assetId: "a" }));
    await importPremiereArchive(xml([file]), { [file]: new Uint8Array([1]) }, { storeAsset });
    expect(storeAsset).toHaveBeenCalledWith(expect.objectContaining({ contentType }));
  });
  it("leaves an ambiguous basename unresolved", async () => {
    const storeAsset = vi.fn(async () => ({ assetId: "wrong" }));
    const result = await importPremiereArchive(xml(["file://localhost/editor/C0001.mp4"]), {
      "CameraA/C0001.mp4": new Uint8Array([1]), "CameraB/C0001.mp4": new Uint8Array([2])
    }, { storeAsset });
    expect(storeAsset).not.toHaveBeenCalled();
    expect(result.timeline.missingClips).toBe(1);
  });
});
