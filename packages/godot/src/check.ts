import { readTscn, referencedIds } from "./reader.js";
import type { GodotProject } from "./types.js";

const RESOURCE_FILE = /\.(tscn|tres)$/;

/**
 * Static check of a written project: every `ExtResource`/`SubResource`
 * reference in every `.tscn`/`.tres` resolves to a declared id, every
 * `ext_resource path` exists among the project's files or copies, and every
 * header's `load_steps` counts the resources it declares. Empty means ok.
 */
export function checkGodotProject(project: GodotProject): string[] {
  const problems: string[] = [];
  const present = new Set<string>();
  for (const file of project.files) {
    present.add(`res://${file.path}`);
  }
  for (const copy of project.copies) {
    present.add(`res://${copy.path}`);
  }
  for (const file of project.files) {
    if (!RESOURCE_FILE.test(file.path)) {
      continue;
    }
    let doc;
    try {
      doc = readTscn(file.content);
    } catch (error) {
      problems.push(
        `${file.path}: ${error instanceof Error ? error.message : String(error)}`
      );
      continue;
    }
    const extIds = new Set<string>();
    const subIds = new Set<string>();
    for (const block of doc.blocks) {
      if (block.kind === "ext_resource") {
        extIds.add(block.attributes.id);
        const path = block.attributes.path;
        if (!present.has(path)) {
          problems.push(
            `${file.path}: ext_resource path ${path} is not in the project`
          );
        }
      } else if (block.kind === "sub_resource") {
        subIds.add(block.attributes.id);
      }
    }
    for (const block of doc.blocks) {
      const refs = referencedIds(block);
      for (const id of refs.ext) {
        if (!extIds.has(id)) {
          problems.push(
            `${file.path}: [${block.kind}] references ExtResource("${id}") which is not declared`
          );
        }
      }
      for (const id of refs.sub) {
        if (!subIds.has(id)) {
          problems.push(
            `${file.path}: [${block.kind}] references SubResource("${id}") which is not declared`
          );
        }
      }
    }
    const declared = doc.header.attributes.load_steps;
    const expected = 1 + extIds.size + subIds.size;
    if (declared !== undefined && Number(declared) !== expected) {
      problems.push(`${file.path}: load_steps=${declared}, declares ${expected}`);
    }
  }
  return problems;
}
