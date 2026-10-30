import { describe, expect, it, vi } from "vitest";
import { resolveNativeModelImage, type NativeModelImageAssetSource } from "../src/native-browser/assets.js";

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64"));
async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
}
function source(bytes = png): NativeModelImageAssetSource {
  return { entries: [{ id:"model",kind:"model",size:16,dependencies:["buffer"] },
    { id:"buffer",kind:"buffer",size:1,dependencies:["image"] }, {id:"image",kind:"image",size:bytes.length,dependencies:[]}],
    verifiedRange: vi.fn((id, offset, length) => { if (id !== "image") { throw new Error("Fixture source missing"); } return bytes.slice(offset, offset + length); }) };
}

describe("native prepared image source resolution", () => {
  it("resolves a verified image in the selected model's transitive dependency closure", async () => {
    const assets = source(), hash = await digest(png);
    const image = await resolveNativeModelImage({mimeType:"image/png",source:{assetId:"image",offset:0,length:png.length,digest:hash}},"model",assets);
    expect(image).toEqual({bytes:png,digest:hash,mimeType:"image/png"});
    image.bytes[0]=0;expect(png[0]).toBe(137);
    expect(assets.verifiedRange).toHaveBeenCalledTimes(1);
  });
  it("resolves an embedded model range and a declared buffer range", async () => {
    const wrapped = new Uint8Array(png.length+8);wrapped.set(png,4);const hash=await digest(png);
    for (const assetId of ["model","buffer"]) {
      const assets: NativeModelImageAssetSource={entries:[{id:"model",kind:"model",size:wrapped.length,dependencies:["buffer"]},
        {id:"buffer",kind:"buffer",size:wrapped.length,dependencies:[]}],verifiedRange:(id,offset,length)=>{expect(id).toBe(assetId);return wrapped.slice(offset,offset+length);}};
      expect((await resolveNativeModelImage({mimeType:"image/png",source:{assetId,offset:4,length:png.length,digest:hash}},"model",assets)).bytes).toEqual(png);
    }
  });
  it("rejects malformed descriptors before reading any cached range", async () => {
    const assets=source(), good={assetId:"image",offset:0,length:png.length,digest:await digest(png)};
    for (const image of [
      {mimeType:"image/png",bytes:Array.from(png)},
      {mimeType:"image/png",source:{...good,url:"https://example.test/image.png"}},
      {mimeType:"image/png",source:{...good,offset:-1}},
      {mimeType:"image/png",source:{...good,offset:0.5}},
      {mimeType:"image/png",source:{...good,length:0}},
      {mimeType:"image/png",source:{...good,length:8*1024*1024+1}},
      {mimeType:"image/png",source:{...good,offset:8*1024*1024}},
      {mimeType:"image/svg+xml",source:good},
      {mimeType:"image/png",source:{...good,digest:"BAD"}},
      {mimeType:"image/png",source:{...good,assetId:"../image"}}
    ]) { await expect(resolveNativeModelImage(image,"model",assets)).rejects.toBeDefined(); }
    expect(assets.verifiedRange).not.toHaveBeenCalled();
  });
  it("rejects undeclared, unrelated, and out-of-range source assets without a read", async () => {
    const original=source(), assets={...original,entries:[...original.entries,{id:"unrelated",kind:"image",size:png.length,dependencies:[]}]};
    const good={assetId:"image",offset:0,length:png.length,digest:await digest(png)};
    for (const bad of [{...good,assetId:"missing"},{...good,assetId:"unrelated"},{...good,offset:1},{...good,length:png.length+1}]) {
      await expect(resolveNativeModelImage({mimeType:"image/png",source:bad},"model",assets)).rejects.toThrow();
    }
    await expect(resolveNativeModelImage({mimeType:"image/png",source:good},"image",assets)).rejects.toThrow("declared model");
    expect(assets.verifiedRange).not.toHaveBeenCalled();
  });
  it("rejects a wrong range length, digest, MIME signature, and unverified cache capability", async () => {
    const good={assetId:"image",offset:0,length:png.length,digest:await digest(png)};
    await expect(resolveNativeModelImage({mimeType:"image/png",source:{...good,digest:"0".repeat(64)}},"model",source())).rejects.toThrow("digest mismatch");
    await expect(resolveNativeModelImage({mimeType:"image/jpeg",source:good},"model",source())).rejects.toThrow("MIME signature");
    await expect(resolveNativeModelImage({mimeType:"image/png",source:good},"model",{...source(),verifiedRange:()=>png.slice(1)})).rejects.toThrow("invalid length");
    await expect(resolveNativeModelImage({mimeType:"image/png",source:good},"model",{...source(),verifiedRange:()=>{throw new Error("not verified");}})).rejects.toThrow("not verified");
  });
  it("walks a large cyclic dependency graph without recursion or repeated source reads", async () => {
    const entries: NativeModelImageAssetSource["entries"][number][]=[];
    for(let index=0;index<4095;index++) { entries.push({id:index===0?"model":`dep-${index}`,kind:index===0?"model":"buffer",size:1,
      dependencies:[index===4094?"image":`dep-${index+1}`]}); }
    entries.push({id:"image",kind:"image",size:png.length,dependencies:["model"]});
    const read=vi.fn(()=>png.slice());
    await resolveNativeModelImage({mimeType:"image/png",source:{assetId:"image",offset:0,length:png.length,digest:await digest(png)}},"model",{entries,verifiedRange:read});
    expect(read).toHaveBeenCalledTimes(1);
  });
});
