import { z } from "zod";
import { NodeRegistry } from "./registry.js";
import { isCallable } from "./type-predicates.js";

/** Verify an installed registrar using the SDK instance shared by its node classes. */
export function verifyNodePackRegistration(packId: string, registrar: unknown, expectedNodeTypes: readonly string[]): void {
  const register = z.custom<(registry: NodeRegistry) => void>(isCallable).parse(registrar);
  const registry = new NodeRegistry();
  registry.registerPackage(packId, register);
  const actual = [...registry.list()].sort();
  const expected = [...expectedNodeTypes].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Pack owned node types differ from catalog: ${packId}`);
  }
}
