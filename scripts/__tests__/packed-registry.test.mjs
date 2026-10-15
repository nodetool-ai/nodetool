import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { artifactIntegrity, startPackedRegistry } from "../packed-registry.mjs";
it("serves unchanged original artifact metadata and bytes and refuses absent first-party packages", async () => {
  const root=mkdtempSync(join(tmpdir(),"original-registry-")); let registry;
  try {
    mkdirSync(join(root,"package"));
    const name="@nodetool-ai/fixture";
    writeFileSync(join(root,"package/package.json"),JSON.stringify({name,version:"1.2.3",dependencies:{"is-odd":"3.0.1"}}));
    writeFileSync(join(root,"package/index.js"),"export const original = true;\n");
    const file=join(root,"original.tgz");
    expect(spawnSync("tar",["-czf",file,"-C",root,"package"]).status).toBe(0);
    const integrity=artifactIntegrity(file);
    registry=await startPackedRegistry({[name]:file});
    const metadata=await (await fetch(`${registry.url}/${encodeURIComponent(name)}`)).json();
    expect(metadata.versions["1.2.3"].dependencies).toEqual({"is-odd":"3.0.1"});
    expect(metadata.versions["1.2.3"].dist.integrity).toBe(integrity);
    const bytes=Buffer.from(await (await fetch(metadata.versions["1.2.3"].dist.tarball)).arrayBuffer());
    expect(bytes.equals(readFileSync(file))).toBe(true);
    expect((await fetch(`${registry.url}/@nodetool-ai%2fmissing`)).status).toBe(404);
    expect(artifactIntegrity(file)).toBe(integrity);
  } finally { await registry?.close(); rmSync(root,{recursive:true,force:true}); }
});
it("rejects an empty artifact registry",async()=>{await expect(startPackedRegistry({})).rejects.toThrow("no artifacts");});
