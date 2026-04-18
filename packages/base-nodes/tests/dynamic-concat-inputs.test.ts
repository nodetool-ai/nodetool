import { describe, expect, it } from "vitest";
import { ConcatAudioNode, ConcatTextNode } from "../src/index.js";

function audioRef(bytes: number[]) {
  return {
    type: "audio",
    uri: "",
    data: Buffer.from(new Uint8Array(bytes)).toString("base64")
  };
}

describe("dynamic concat inputs", () => {
  it("ConcatAudioNode concatenates static and dynamic inputs", async () => {
    const node = new ConcatAudioNode();
    node.assign({
      a: audioRef([1, 2]),
      b: audioRef([3, 4]),
      c: audioRef([5]),
      d: audioRef([6])
    });

    const result = await node.process();
    const output = result.output as { data: string };
    const bytes = Buffer.from(output.data, "base64");

    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("ConcatTextNode concatenates static and dynamic inputs", async () => {
    const node = new ConcatTextNode();
    node.assign({
      a: "hello",
      b: ", ",
      c: "dynamic",
      d: " world"
    });

    const result = await node.process();
    expect(result.output).toBe("hello, dynamic world");
  });
});
