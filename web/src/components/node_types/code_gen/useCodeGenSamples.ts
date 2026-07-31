/**
 * Sample state for one open of the code-generation dialog.
 *
 * The latest connected values are read once per open — a value that changed
 * mid-dialog would silently redefine the payload the user already reviewed.
 * Hand edits are kept separately so clearing one falls back to the run value.
 */
import { useCallback, useMemo, useState } from "react";

import { useNodeStoreRef } from "../../../contexts/NodeContext";
import {
  buildSampleEntries,
  latestInputValues,
  type SampleEntry,
  type SamplePort
} from "./codeGenSamples";

export interface UseCodeGenSamplesResult {
  /** Entries for the ports passed in, in declaration order. */
  entriesFor: (ports: readonly SamplePort[]) => SampleEntry[];
  setValue: (name: string, value: unknown) => void;
  /** Drop a hand edit so the port falls back to its latest-run value. */
  clearValue: (name: string) => void;
  reset: () => void;
}

export function useCodeGenSamples(
  nodeId: string,
  /** Bumped by the dialog on every open to re-read the latest run. */
  epoch: number
): UseCodeGenSamplesResult {
  const nodeStore = useNodeStoreRef();
  const [manual, setManual] = useState<Record<string, unknown>>({});

  // `epoch` is the re-read trigger, not an argument: the store is read
  // imperatively so the dialog does not re-render on every graph change.
  const latest = useMemo(
    () => latestInputValues(nodeStore, nodeId),
    [nodeStore, nodeId, epoch]
  );

  const entriesFor = useCallback(
    (ports: readonly SamplePort[]) => buildSampleEntries(ports, latest, manual),
    [latest, manual]
  );

  const setValue = useCallback((name: string, value: unknown) => {
    setManual((previous) => ({ ...previous, [name]: value }));
  }, []);

  const clearValue = useCallback((name: string) => {
    setManual((previous) => {
      if (!Object.prototype.hasOwnProperty.call(previous, name)) {
        return previous;
      }
      const next = { ...previous };
      delete next[name];
      return next;
    });
  }, []);

  const reset = useCallback(() => setManual({}), []);

  return { entriesFor, setValue, clearValue, reset };
}
