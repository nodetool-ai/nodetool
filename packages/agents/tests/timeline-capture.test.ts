import { describe, expect, it } from "vitest";
import { captureTimelineScenes } from "../src/timeline-capture.js";

interface Record {
  src: string;
  video: string | null;
  decls: { at: number; top: boolean; src: string }[];
  imports: { m: string; i: string; l: string }[];
  snap: string[];
  errors: string[];
}

/** Every capture record the transform added, in source order. */
function records(out: string): Record[] {
  const found: Record[] = [];
  const pattern =
    /\{__ntCapture:1,src:(".*?"),video:(.*?),decls:(\[.*?\]),imports:(\[.*?\]),snap:\[(.*?)\],errors:(\[.*?\])\}/g;
  for (const m of out.matchAll(pattern)) {
    found.push({
      src: JSON.parse(m[1]!) as string,
      video: JSON.parse(m[2]!) as string | null,
      decls: JSON.parse(m[3]!) as Record["decls"],
      imports: JSON.parse(m[4]!) as Record["imports"],
      snap: [...m[5]!.matchAll(/\["([^"]+)",/g)].map((s) => s[1]!),
      errors: JSON.parse(m[6]!) as string[]
    });
  }
  return found;
}

const HEADER = `import { video, rad } from "@nodetool-ai/sandbox-timeline";\n`;

function capture(body: string): Record[] {
  return records(captureTimelineScenes(HEADER + body));
}

describe("captureTimelineScenes", () => {
  it("leaves code without the timeline pack unchanged", () => {
    const code = `const v = { scene: () => 1 };\nv.scene("a", 1, (s) => s);`;
    expect(captureTimelineScenes(code)).toBe(code);
  });

  it("leaves code it cannot parse unchanged", () => {
    const code = `${HEADER}v.scene("a", 1, (s) => {`;
    expect(captureTimelineScenes(code)).toBe(code);
  });

  it("keeps every line where it was", () => {
    const code = `${HEADER}const v = video({});\nconst x = 1;\nv.scene("a", 1, (s) => {\n  s.text(String(x));\n});\n`;
    const out = captureTimelineScenes(code);
    expect(out.split("\n")).toHaveLength(code.split("\n").length);
    expect(out).not.toBe(code);
  });

  it("keeps pure top-level declarations as source and names the video binding", () => {
    const [record] = capture(`
const PAD = 120;
function title(s, t) { return s.text(t, { x: PAD, rotation: rad(3) }); }
const v = video({ width: 640, height: 360, fps: 30 });
v.scene("a", 1, (s) => { title(s, "Hi"); });
`);
    expect(record!.video).toBe("v");
    expect(record!.snap).toEqual([]);
    expect(record!.errors).toEqual([]);
    expect(record!.decls.map((d) => [d.src, d.top])).toEqual([
      ["const PAD = 120;", true],
      ['function title(s, t) { return s.text(t, { x: PAD, rotation: rad(3) }); }', true]
    ]);
    expect(record!.imports).toEqual([
      { m: "@nodetool-ai/sandbox-timeline", i: "rad", l: "rad" }
    ]);
  });

  it("snapshots the value a scene reads, not the awaited result it came from", () => {
    const [record] = capture(`
const research = await fetchSomething();
const headline = research.title;
const v = video({});
v.scene("a", 1, (s) => { s.text(headline); });
`);
    expect(record!.snap).toEqual(["headline"]);
    expect(record!.decls).toEqual([]);
  });

  it("snapshots let bindings, loop variables and parameters", () => {
    const [record] = capture(`
let count = 3;
const v = video({});
for (const [i, name] of ["a"].entries()) {
  v.scene(name, 1, (s) => { s.text(name + i + count); });
}
`);
    expect(record!.snap.sort()).toEqual(["count", "i", "name"]);
  });

  it("snapshots a const that code after it mutates", () => {
    const [record] = capture(`
const cfg = { size: 10 };
cfg.size = 20;
const v = video({});
v.scene("a", 1, (s) => { s.text(String(cfg.size)); });
`);
    expect(record!.snap).toEqual(["cfg"]);
  });

  it("keeps a helper that reads a shared counter, printed after the counter's snapshot", () => {
    const [record] = capture(`
let idc = 0;
const glow = (color) => ({ id: "g" + (++idc), color });
const v = video({});
v.scene("a", 1, (s) => { s.rect(1, 1, "#fff", { effects: [glow("#fff")] }); });
`);
    expect(record!.snap).toEqual(["idc"]);
    expect(record!.decls).toEqual([
      expect.objectContaining({ top: false, src: 'const glow = (color) => ({ id: "g" + (++idc), color });' })
    ]);
  });

  it("reports a capability used inside a scene", () => {
    const [record] = capture(`
const v = video({});
v.scene("a", 1, (s) => { nodetool.media.generateImage("x"); });
`);
    expect(record!.errors.join(" ")).toContain("`nodetool`");
  });

  it("treats the host prelude above the pack import as the host's", () => {
    const code =
      `const nodetool = { media: {} };\n` +
      HEADER +
      `const v = video({});\nv.scene("a", 1, (s) => { s.text(String(nodetool)); });\n`;
    const [record] = records(captureTimelineScenes(code));
    expect(record!.errors.join(" ")).toContain("belongs to the host");
    expect(record!.decls).toEqual([]);
  });

  it("reports Math.random() in a scene and in a kept helper", () => {
    const [inScene] = capture(`
const v = video({});
v.scene("a", 1, (s) => { s.text(String(Math.random())); });
`);
    expect(inScene!.errors.join(" ")).toContain("Math.random");

    const [inHelper] = capture(`
function jitter() { return Math.random(); }
const v = video({});
v.scene("a", 1, (s) => { s.text(String(jitter())); });
`);
    expect(inHelper!.errors.join(" ")).toContain("Math.random");
  });

  it("reports an import from outside the sandbox packs", () => {
    const code =
      HEADER +
      `import { thing } from "some-npm-package";\nconst v = video({});\nv.scene("a", 1, (s) => { s.text(thing); });\n`;
    const [record] = records(captureTimelineScenes(code));
    expect(record!.errors.join(" ")).toContain("some-npm-package");
  });

  it("captures a scene callback passed by name", () => {
    const [record] = capture(`
function build(s) { s.text("Hi"); }
const v = video({});
v.scene("a", 1, build);
`);
    expect(record!.src).toBe("build");
    expect(record!.decls.map((d) => d.src)).toEqual(['function build(s) { s.text("Hi"); }']);
  });

  it("appends the record after a fourth argument and skips a call already captured", () => {
    const out = captureTimelineScenes(
      `${HEADER}const v = video({});\nv.scene("a", 1, (s) => s, { transform: 1 });\n`
    );
    expect(out).toContain("{ transform: 1 }, {__ntCapture:1");
    expect(captureTimelineScenes(out)).toBe(out);
  });
});
