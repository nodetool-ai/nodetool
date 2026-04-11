import { describe, it, expect } from "vitest";
import {
  HttpGetTextNode,
  HttpGetJsonNode,
  HttpGetBytesNode,
  HttpPostNode,
  HttpPutNode,
  HttpPatchNode,
  HttpDeleteNode
} from "../src/index.js";

describe("lib.http nodes", () => {
  it("HttpGetTextNode has correct metadata", () => {
    expect(HttpGetTextNode.nodeType).toBe("lib.http.GetText");
    expect(HttpGetTextNode.title).toBe("HTTP GET Text");
  });

  it("HttpGetJsonNode has correct metadata", () => {
    expect(HttpGetJsonNode.nodeType).toBe("lib.http.GetJSON");
    expect(HttpGetJsonNode.title).toBe("HTTP GET JSON");
  });

  it("HttpGetBytesNode has correct metadata", () => {
    expect(HttpGetBytesNode.nodeType).toBe("lib.http.GetBytes");
    expect(HttpGetBytesNode.title).toBe("HTTP GET Bytes");
  });

  it("HttpPostNode has correct metadata", () => {
    expect(HttpPostNode.nodeType).toBe("lib.http.Post");
    expect(HttpPostNode.title).toBe("HTTP POST");
  });

  it("HttpPutNode has correct metadata", () => {
    expect(HttpPutNode.nodeType).toBe("lib.http.Put");
    expect(HttpPutNode.title).toBe("HTTP PUT");
  });

  it("HttpPatchNode has correct metadata", () => {
    expect(HttpPatchNode.nodeType).toBe("lib.http.Patch");
    expect(HttpPatchNode.title).toBe("HTTP PATCH");
  });

  it("HttpDeleteNode has correct metadata", () => {
    expect(HttpDeleteNode.nodeType).toBe("lib.http.Delete");
    expect(HttpDeleteNode.title).toBe("HTTP DELETE");
  });

  it("HttpGetTextNode throws on empty URL", async () => {
    await expect(new HttpGetTextNode({}).process()).rejects.toThrow("URL is required");
  });

  it("HttpPostNode throws on empty URL", async () => {
    await expect(new HttpPostNode({}).process()).rejects.toThrow("URL is required");
  });

  it("HttpDeleteNode throws on empty URL", async () => {
    await expect(new HttpDeleteNode({}).process()).rejects.toThrow("URL is required");
  });
});
