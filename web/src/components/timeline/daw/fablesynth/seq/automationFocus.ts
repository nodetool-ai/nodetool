import type { MachineId } from './protocol';

type AutomationFocus = {
  canShow: (paramId: string) => boolean;
  show: (paramId: string) => void;
  /** True when the focused clip has a lane for this parameter. */
  has?: (paramId: string) => boolean;
  /** Delete the focused clip's lane for this parameter. */
  remove?: (paramId: string) => void;
};
const editors = new Map<MachineId, AutomationFocus>();

export function registerAutomationFocus(machine: MachineId, editor: AutomationFocus) {
  editors.set(machine, editor);
  return () => { if (editors.get(machine) === editor) editors.delete(machine); };
}

export function automationFocus(machine: MachineId) {
  return editors.get(machine);
}
