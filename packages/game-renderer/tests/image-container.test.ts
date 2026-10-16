import { createCanvas } from "@napi-rs/canvas";
import { expect, it } from "vitest";
import { inspectGameImageContainer, prepareGameImage3D } from "../src/renderer3d/assets/image-preparation.js";

it("rejects a JPEG containing dimensions and EOI but no image scan", async () => {
  const jpeg = createCanvas(2, 2).toBuffer("image/jpeg");
  const scan = jpeg.indexOf(Buffer.from([255, 218]));
  expect(scan).toBeGreaterThan(0);
  const bytes = Buffer.concat([jpeg.subarray(0, scan), Buffer.from([255, 217])]);
  const prepared = await prepareGameImage3D(bytes, { assetId: "missing-scan" });
  expect(prepared.ok).toBe(false);
});


it.each(["png", "jpeg", "webp"] as const)("retains valid %s container inspection", async (format) => {
  const bytes = createCanvas(2, 2).toBuffer(`image/${format}`);
  expect(inspectGameImageContainer(bytes)).toEqual({ format, width: 2, height: 2 });
  expect((await prepareGameImage3D(bytes, { assetId: "valid-control" })).ok).toBe(true);
});

it("keeps neutral inspection independent of the 3D allocation profile", async () => {
  const bytes = createCanvas(8192, 1).toBuffer("image/png");
  expect(inspectGameImageContainer(bytes)).toEqual({ format: "png", width: 8192, height: 1 });
  expect((await prepareGameImage3D(bytes, { assetId: "wide-image" })).ok).toBe(false);
});
