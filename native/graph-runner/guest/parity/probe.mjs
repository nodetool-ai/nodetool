// Load probe for the parity profile. For every class the node modules
// exported, it repeats the two guest steps that can fail before a node runs:
// building the registry entry (what entry.mjs `types()` does for the kernel)
// and constructing an executor (what `create()` does). Classes whose entry
// cannot be built are left out of the guest, because one failing entry would
// fail `types()` and with it every run.
//
// The probe node `nodetool.parity.Probe` outputs the report, so a run of
// probe -> Output in the native runner records it.
import { BaseNode, createGraphNodeTypeResolver, NodeRegistry } from "@nodetool-ai/node-sdk";

function errorText(err) {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function entryError(cls) {
  try {
    const registry = new NodeRegistry();
    registry.register(cls);
    if (!registry.resolveMetadata(cls.nodeType)) return "no registry metadata";
    createGraphNodeTypeResolver(registry);
    return null;
  } catch (err) {
    return errorText(err);
  }
}

function instantiateError(cls) {
  try {
    const instance = new cls({});
    instance.toExecutor();
    return null;
  } catch (err) {
    return errorText(err);
  }
}

export function buildProbe(moduleReport, classes) {
  const admitted = {};
  const nodes = {};
  for (const [type, cls] of Object.entries(classes)) {
    const entry = entryError(cls);
    if (entry) {
      nodes[type] = { loaded: true, registered: false, error: entry };
      continue;
    }
    admitted[type] = cls;
    const instantiate = instantiateError(cls);
    nodes[type] = instantiate
      ? { loaded: true, registered: true, instantiated: false, error: instantiate }
      : { loaded: true, registered: true, instantiated: true };
  }

  class Probe extends BaseNode {
    static nodeType = "nodetool.parity.Probe";
    static title = "Parity Probe";
    static description = "Reports which node classes loaded in the guest.";
    static metadataOutputTypes = { output: "dict" };

    async process() {
      return { output: { modules: moduleReport, nodes } };
    }
  }

  return { admitted, Probe };
}
