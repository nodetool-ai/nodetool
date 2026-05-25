/**
 * Applies NodeConfig overrides (className/docstring/enum renames/field overrides)
 * onto a parsed NodeSpec so the manifest reflects per-model customisations.
 */

import type { NodeSpec, NodeConfig } from "./types.js";

export class NodeGenerator {
  applyConfig(spec: NodeSpec, config: NodeConfig): NodeSpec {
    spec = {
      ...spec,
      inputFields: [...spec.inputFields],
      enums: [...spec.enums]
    };

    if (config.className !== undefined) spec.className = config.className;
    if (config.docstring !== undefined) spec.docstring = config.docstring;
    if (config.tags !== undefined) spec.tags = config.tags;
    if (config.useCases !== undefined) spec.useCases = config.useCases;
    if (config.returnType !== undefined) spec.outputType = config.returnType;

    const enumRenameMap: Record<string, string> = {};
    if (config.enumOverrides) {
      for (const enumDef of spec.enums) {
        if (config.enumOverrides[enumDef.name]) {
          const oldName = enumDef.name;
          enumDef.name = config.enumOverrides[oldName];
          enumRenameMap[oldName] = enumDef.name;
        }
      }
    }

    if (config.enumValueOverrides) {
      for (const enumDef of spec.enums) {
        const origName =
          Object.entries(enumRenameMap).find(
            ([, v]) => v === enumDef.name
          )?.[0] ?? enumDef.name;
        const valueMap =
          config.enumValueOverrides[enumDef.name] ??
          config.enumValueOverrides[origName];
        if (valueMap) {
          enumDef.values = enumDef.values.map(([key, val]) => [
            valueMap[key] ?? key,
            val
          ]);
        }
      }
    }

    if (Object.keys(enumRenameMap).length > 0) {
      spec.inputFields = spec.inputFields.map((f) => {
        if (f.enumRef && enumRenameMap[f.enumRef]) {
          return { ...f, enumRef: enumRenameMap[f.enumRef] };
        }
        return f;
      });
    }

    if (config.fieldOverrides) {
      spec.inputFields = spec.inputFields.map((f) => {
        const override = config.fieldOverrides![f.name];
        if (!override) return f;
        const merged = { ...f, ...override };
        if (override.enumRef) {
          const enumDef = spec.enums.find((e) => e.name === override.enumRef);
          if (enumDef) {
            merged.enumValues = enumDef.values.map(([, rawVal]) => rawVal);
          }
        }
        return merged;
      });
    }

    return spec;
  }
}
