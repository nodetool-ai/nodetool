/**
 * Fault module registry (task D1) — name -> {@link FaultModule} lookup.
 * `compare.ts` resolves a journey's declared (or `--faults`-selected) fault
 * names against this map; a name with no registered module is reported as
 * "unknown" the same way `compare.ts` already reports unknown invariants,
 * rather than silently no-oping.
 *
 * D2/D3 add their own module files and call {@link registerFaultModule} from
 * them (see `index.ts`'s barrel) — no edits needed here.
 */
import type { FaultModule } from "./types.js";

const FAULT_MODULES = new Map<string, FaultModule>();

export function registerFaultModule(module: FaultModule): void {
  FAULT_MODULES.set(module.name, module);
}

export function getFaultModule(name: string): FaultModule | undefined {
  return FAULT_MODULES.get(name);
}

export function listFaultModuleNames(): string[] {
  return Array.from(FAULT_MODULES.keys()).sort();
}

/** Test-only escape hatch: clears every registered module. */
export function clearFaultModulesForTests(): void {
  FAULT_MODULES.clear();
}
