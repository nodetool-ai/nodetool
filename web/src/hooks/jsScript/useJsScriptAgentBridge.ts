/**
 * useJsScriptAgentBridge
 *
 * Registers a {@link JsScriptAgentHandler} under the surrounding JsScriptSurface's
 * script id, so the `ui_jsscript_*` agent tools can address this script by id
 * whether or not it is the focused surface. Mirrors {@link useScriptAgentBridge};
 * the handler is cleared on unmount unless it has already been replaced.
 */

import { useEffect, useMemo } from "react";
import type { SandboxModuleDeclaration } from "@nodetool-ai/protocol";
import { validateJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";

import {
  useJsScriptStore,
  type JsScriptEntry,
  type JsScriptRunOutcome,
  type JsScriptTestReport
} from "../../stores/jsScript/JsScriptStore";
import {
  getJsScriptAgentHandler,
  hasJsScriptAgentHandler,
  setJsScriptAgentHandler,
  type JsScriptAgentHandler,
  type JsScriptSnapshot
} from "../../components/jsScript/jsScriptAgentBridge";
import { runJsScript } from "../../components/jsScript/runJsScript";
import { gradeJsScriptTests } from "../../components/jsScript/gradeJsScriptTests";
import { flushJsScriptSave } from "./jsScriptSaveRegistry";
import {
  assertJsScriptTestsPresent,
  emptyDeclaredOutputsError,
  jsScriptFlushFailedError,
  missingDeclaredOutputs
} from "./jsScriptRunGates";

export const useJsScriptAgentBridge = (scriptId: string): void => {
  const handler = useMemo<JsScriptAgentHandler>(() => {
    const store = () => useJsScriptStore.getState();

    const requireEntry = (): JsScriptEntry => {
      const entry = store().getScript(scriptId);
      if (!entry) {
        throw new Error(`No JS script "${scriptId}" is open.`);
      }
      return entry;
    };

    const snapshot = (): JsScriptSnapshot => {
      const entry = requireEntry();
      return {
        scriptId,
        name: entry.name,
        document: entry.document,
        issues: validateJsScriptDocument(entry.document),
        lastRun: store().lastRun[scriptId] ?? null,
        lastTest: store().lastTest[scriptId] ?? null
      };
    };

    const run = async (
      inputs: Record<string, unknown>,
      inputStreams?: Record<string, unknown[]>
    ): Promise<JsScriptRunOutcome> => {
      const flushed = await flushJsScriptSave(scriptId);
      if (!flushed.ok) {
        const outcome: JsScriptRunOutcome = {
          ok: false,
          logs: [],
          duration_ms: 0,
          error: jsScriptFlushFailedError("run", flushed.error)
        };
        store().setLastRun(scriptId, outcome);
        return outcome;
      }
      const ports = requireEntry().document.outputs;
      store().setRunning(scriptId, true);
      try {
        const outcome = await runJsScript(scriptId, inputs, inputStreams);
        const missing = missingDeclaredOutputs(ports, outcome.outputs);
        if (outcome.ok && ports.length > 0 && missing.length === ports.length) {
          const failed: JsScriptRunOutcome = {
            ...outcome,
            ok: false,
            error: emptyDeclaredOutputsError(missing)
          };
          store().setLastRun(scriptId, failed);
          return failed;
        }
        store().setLastRun(scriptId, outcome);
        return outcome;
      } finally {
        store().setRunning(scriptId, false);
      }
    };

    return {
      getSnapshot: snapshot,
      setCode: (code) => {
        store().setCode(scriptId, code);
        return snapshot();
      },
      setPorts: (ports) => {
        store().setPorts(scriptId, ports);
        return snapshot();
      },
      setPackages: (packages: SandboxModuleDeclaration[]) => {
        store().setPackages(scriptId, packages);
        return snapshot();
      },
      setMeta: (meta) => {
        if (meta.name !== undefined) store().setName(scriptId, meta.name);
        if (meta.description !== undefined) {
          store().setDescription(scriptId, meta.description);
        }
        if (meta.secrets !== undefined) {
          store().setSecrets(scriptId, meta.secrets);
        }
        if (meta.timeoutSeconds !== undefined) {
          store().setTimeoutSeconds(scriptId, meta.timeoutSeconds);
        }
        if (meta.palette !== undefined) {
          store().setPalette(scriptId, meta.palette);
        }
        return snapshot();
      },
      setTests: (tests) => {
        store().setTests(scriptId, tests);
        return snapshot();
      },
      run,
      test: async (): Promise<JsScriptTestReport> => {
        const flushed = await flushJsScriptSave(scriptId);
        if (!flushed.ok) {
          throw new Error(jsScriptFlushFailedError("test", flushed.error));
        }
        const tests = requireEntry().document.tests;
        assertJsScriptTestsPresent(tests);
        store().setRunning(scriptId, true);
        try {
          const report = await gradeJsScriptTests(
            tests,
            (inputs, inputStreams) =>
              runJsScript(scriptId, inputs, inputStreams)
          );
          store().setLastTest(scriptId, report);
          return report;
        } finally {
          store().setRunning(scriptId, false);
        }
      }
    };
  }, [scriptId]);

  useEffect(() => {
    setJsScriptAgentHandler(scriptId, handler);
    return () => {
      // Another surface may already have taken the id (a remount racing an
      // unmount); only clear the registration this effect installed.
      if (
        hasJsScriptAgentHandler(scriptId) &&
        getJsScriptAgentHandler(scriptId) === handler
      ) {
        setJsScriptAgentHandler(scriptId, null);
      }
    };
  }, [scriptId, handler]);
};

export default useJsScriptAgentBridge;
