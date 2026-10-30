import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import metadata from "./fixtures/quickjs-npm-metadata.json";

it("every QuickJS wrapper consumer keeps fresh installs in the WASM variant's minor cohort", () => {
  const packages = resolve(import.meta.dirname, "../..");
  const consumers = readdirSync(packages, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => {
    const file = resolve(packages, entry.name, "package.json");
    let manifest;
    try { manifest = JSON.parse(readFileSync(file, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") { return []; } throw error; }
    return manifest.dependencies?.["@sebastianwessel/quickjs"] ? [{ name: entry.name, manifest }] : [];
  });
  expect(consumers.map(consumer => consumer.name).sort()).toEqual(["agents", "sandbox-compiler"]);
  const variantCohort = metadata.variant.version.split(".").slice(0, 2).join(".");
  for (const { manifest } of consumers) {
    const range = manifest.dependencies["@sebastianwessel/quickjs"];
    expect(range).toBe("~3.0.1");
    const wrapperMinor = range.slice(1).split(".").slice(0, 2).join(".") + ".";
    const candidates = metadata.wrappers.filter(wrapper => wrapper.version.startsWith(wrapperMinor));
    expect(candidates.length).toBeGreaterThan(0);
    for (const wrapper of candidates) { expect(wrapper.quickjsCore.slice(1).split(".").slice(0, 2).join(".")).toBe(variantCohort); }
    expect(manifest.dependencies[metadata.variant.name]).toBe("^" + metadata.variant.version);
  }
  // npm published 3.1.0 within the former ^3.0.1 range, but its ABI differs.
  expect(metadata.wrappers.find(wrapper => wrapper.version === "3.1.0")?.quickjsCore).toBe("^0.32.0");
});

it("keeps the vendored JavaScript runtime pinned to its recorded source and WASM ABI", () => {
  const root = resolve(import.meta.dirname, "../../sandbox-runtime");
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const provenance = JSON.parse(readFileSync(resolve(root, "vendor/quickjs/PROVENANCE.json"), "utf8"));
  expect(manifest.dependencies["@sebastianwessel/quickjs"]).toBeUndefined();
  expect(manifest.devDependencies["@sebastianwessel/quickjs"]).toBe(provenance.version);
  const wrapper = metadata.wrappers.find(wrapper => wrapper.version === provenance.version);
  expect(wrapper).toBeDefined();
  expect(wrapper?.quickjsCore).toBe("^" + metadata.variant.version);
  expect(manifest.dependencies[metadata.variant.name]).toBe("^" + metadata.variant.version);
});
