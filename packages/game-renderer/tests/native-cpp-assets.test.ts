import { describe, expect, it } from "vitest";
import { createNativeAssetBroker } from "../src/native-cpp/assets.js";

const bytes = new TextEncoder().encode("abc");
const asset = { id: "image", kind: "image" as const, path: "sprite.png", size: 3,
  digest: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", dependencies: [] };
describe("native closed byte broker", () => {
  it("admits declared native 2D image metadata", async () => {
    const broker = createNativeAssetBroker({ assets: [{ ...asset, sampling: "nearest", pivot: { x: 0.5, y: 0.5 } }], fetchBytes: async () => bytes });
    expect(await broker.get("image")).toEqual(bytes); broker.dispose();
  });
  it("verifies once and returns independent owned bytes", async () => {
    let calls = 0;
    const broker = createNativeAssetBroker({ assets: [asset], fetchBytes: async () => { calls++; return bytes; } });
    const first = await broker.get("image"); first[0] = 0;
    expect(await broker.get("image")).toEqual(bytes);
    expect(calls).toBe(1);
    broker.dispose();
    await expect(broker.get("image")).rejects.toThrow("disposed");
  });
  it("rejects tampered bytes and undeclared IDs", async () => {
    const broker = createNativeAssetBroker({ assets: [asset], fetchBytes: async () => new Uint8Array([1, 2, 3]) });
    await expect(broker.get("image")).rejects.toThrow("digest mismatch");
    await expect(broker.get("missing")).rejects.toThrow("Undeclared"); broker.dispose();
  });
  it("supplies only copied ranges from already verified live cache entries without fetching", async () => {
    let calls=0;
    const broker=createNativeAssetBroker({assets:[asset],fetchBytes:async()=>{calls++;return bytes;}});
    expect(()=>broker.verifiedRange("image",0,1)).toThrow("not verified");expect(calls).toBe(0);
    await broker.get("image");const range=broker.verifiedRange("image",1,2);expect(range).toEqual(bytes.slice(1));
    range[0]=0;expect(broker.verifiedRange("image",1,2)).toEqual(bytes.slice(1));expect(calls).toBe(1);
    for(const [offset,length] of [[-1,1],[0.5,1],[0,0],[0,4],[2,2],[Number.MAX_SAFE_INTEGER,1]]) {
      expect(()=>broker.verifiedRange("image",offset,length)).toThrow("range is invalid");
    }
    expect(()=>broker.verifiedRange("missing",0,1)).toThrow("Undeclared");
    broker.release("image");expect(()=>broker.verifiedRange("image",0,1)).toThrow("released");expect(calls).toBe(1);
    broker.dispose();expect(()=>broker.verifiedRange("image",0,1)).toThrow("disposed");
  });
  it("does not publish an unverified or released in-flight fetch as a verified source", async () => {
    let complete:(value:Uint8Array)=>void=()=>{};
    const broker=createNativeAssetBroker({assets:[asset],fetchBytes:()=>new Promise<Uint8Array>((resolve)=>{complete=resolve;})});
    const pending=broker.get("image");expect(()=>broker.verifiedRange("image",0,1)).toThrow("not verified");
    broker.release("image");complete(bytes);await pending;
    expect(()=>broker.verifiedRange("image",0,1)).toThrow("released");broker.dispose();
    const tampered=createNativeAssetBroker({assets:[asset],fetchBytes:async()=>new Uint8Array([1,2,3])});
    await expect(tampered.get("image")).rejects.toThrow("digest mismatch");
    expect(()=>tampered.verifiedRange("image",0,1)).toThrow("not verified");tampered.dispose();
  });
  it("rejects external paths, traversal, duplicate paths and missing dependencies before fetching", () => {
    const create = (assets: Parameters<typeof createNativeAssetBroker>[0]["assets"]): void => {
      createNativeAssetBroker({ assets, fetchBytes: async () => { throw new Error("must not fetch"); } });
    };
    for (const path of ["https://example.com/a", "../a", "a/%2e%2e/b", "/a", "a\\b"]) {
      expect(() => create([{ ...asset, path }])).toThrow("closed relative");
    }
    expect(() => create([asset, { ...asset, id: "other" }])).toThrow("Duplicate");
    expect(() => create([{ ...asset, dependencies: ["missing"] }])).toThrow("Missing");
  });
});
