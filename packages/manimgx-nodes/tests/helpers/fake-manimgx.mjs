#!/usr/bin/env node
/**
 * Fake `manimgx` for runner and node tests.
 *
 * The runner scrubs the child environment, so behavior cannot travel in env:
 * a marker comment in `scene.py` picks it instead.
 *
 *   # fake:ok        writes the outputs a real run writes (default)
 *   # fake:problems  `inspect` reports layout problems and exits 1
 *   # fake:error     prints a traceback and exits 1
 *   # fake:env       reports the child's environment keys
 *   # fake:inputs    reports inputs.json and the staged files' sizes
 *   # fake:symlink   writes the video as a symlink, which must not be read
 *   # fake:empty     exits 0 without writing a video
 *   # fake:argv      reports its argv
 *   # fake:hang      never exits on its own
 */

import { existsSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
if (argv.includes("--version")) {
  console.log("manimgx 0.1.1");
  process.exit(0);
}

const [command, file] = argv;
const source = readFileSync(file, "utf8");
const mode = /# fake:(\w+)/.exec(source)?.[1] ?? "ok";
const output = argv[argv.indexOf("-o") + 1];

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const MP4 = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

if (mode === "hang") {
  // Keep the event loop alive until the runner kills the process.
  setInterval(() => {}, 1000);
} else {
  main();
}

function report() {
  if (mode === "env") return `env: ${Object.keys(process.env).sort().join(",")}`;
  if (mode === "argv") return `argv: ${JSON.stringify(argv)}`;
  if (mode === "inputs") {
    const inputs = JSON.parse(readFileSync("inputs.json", "utf8"));
    const sizes = Object.values(inputs)
      .filter((v) => typeof v === "string" && existsSync(v))
      .map((v) => statSync(v).size);
    return `inputs: ${JSON.stringify(inputs)}\nsizes: ${JSON.stringify(sizes)}\nmodule: ${existsSync("nodetool_inputs.py")}`;
  }
  return "layout: no problems in 2 samples";
}

function main() {
  if (mode === "error") {
    console.error(`${file}:4: in construct\n    self.play(m.Create(m.Circcle()))`);
    console.error("AttributeError: module 'manimgx' has no attribute 'Circcle'");
    console.error("hint: ManimGX has no Circcle; did you mean Circle or Circumscribe?");
    process.exit(1);
  }
  if (command === "render") {
    const stem = output.replace(/\.mp4$/, "");
    if (mode === "symlink") {
      symlinkSync("/etc/hostname", output);
    } else if (mode !== "empty") {
      writeFileSync(output, MP4);
    }
    writeFileSync(`${stem}.storyboard.png`, PNG);
    writeFileSync(`${stem}.storyboard-2.png`, Buffer.concat([PNG, PNG]));
    console.log(`${output}  2.00 s, 640x360 at 30 fps, 0.0 MB (rendered in 0.1 s)`);
    console.log(`storyboard: ${stem}.storyboard.png, ${stem}.storyboard-2.png`);
    console.log(report());
    process.exit(0);
  }

  writeFileSync(output, PNG);
  console.log(`${file}: Fake, 3.00 s, 2 plays`);
  console.log(`storyboard: ${output}`);
  console.log("  #0   0.00– 2.00s  scene.py:6  Write(Text 'a')");
  if (mode === "problems") {
    console.log("layout: 1 problem");
    console.log("  [1] t=2s (scene.py:6)  a and b: texts overlap");
    process.exit(1);
  }
  console.log(report());
  process.exit(0);
}
