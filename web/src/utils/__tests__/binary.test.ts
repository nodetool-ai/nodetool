import * as Binary from "../binary";
const { uint8ArrayToBase64, uint8ArrayToDataUri, base64ErrorImage } = Binary;

describe("binary utilities", () => {
  it("converts Uint8Array to base64", () => {
    const arr = new Uint8Array([72, 101, 108, 108, 111]);
    expect(uint8ArrayToBase64(arr)).toBe("SGVsbG8=");
  });

  it("creates data URI from Uint8Array", () => {
    const arr = new Uint8Array([72, 101, 108, 108, 111]);
    expect(uint8ArrayToDataUri(arr, "text/plain")).toBe(
      "data:text/plain;base64,SGVsbG8="
    );
  });

  it("returns fallback image when base64 conversion fails", () => {
    const originalBtoa = global.btoa;
    (global as any).btoa = () => {
      throw new Error("fail");
    };
    const result = uint8ArrayToBase64(new Uint8Array([1]));
    expect(result).toBe(base64ErrorImage);
    global.btoa = originalBtoa;
  });

  it("returns fallback data URI when conversion fails", () => {
    const originalBtoa = global.btoa;
    (global as any).btoa = () => {
      throw new Error("fail");
    };
    const result = uint8ArrayToDataUri(new Uint8Array([1]), "text/plain");
    expect(result).toBe(`data:text/plain;base64,${base64ErrorImage}`);
    global.btoa = originalBtoa;
  });
});
