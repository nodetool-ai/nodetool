/**
 * The JS script's execution envelope, side by side in one panel: what the
 * script says it does, the ports it declares, the sandbox packages it may
 * import, the secrets it may read, and the timeout it runs under. Every field
 * writes straight into the document, which autosaves.
 */
import { memo, useCallback } from "react";
import type { SandboxModuleDeclaration } from "@nodetool-ai/protocol";

import {
  Divider,
  FlexColumn,
  ScrollArea,
  Text,
  TextInput,
  SPACING
} from "../ui_primitives";
import {
  useJsScriptDocument,
  useJsScriptStore,
  JS_SCRIPT_MAX_TIMEOUT_SECONDS,
  type JsScriptPort
} from "../../stores/jsScript/JsScriptStore";
import JsScriptPortsEditor from "./JsScriptPortsEditor";
import JsScriptPackagesEditor from "./JsScriptPackagesEditor";
import JsScriptSecretsEditor from "./JsScriptSecretsEditor";

export interface JsScriptSettingsPanelProps {
  scriptId: string;
  readOnly?: boolean;
}

const JsScriptSettingsPanel = ({
  scriptId,
  readOnly = false
}: JsScriptSettingsPanelProps) => {
  const document = useJsScriptDocument(scriptId);
  const setDescription = useJsScriptStore((state) => state.setDescription);
  const setPorts = useJsScriptStore((state) => state.setPorts);
  const setPackages = useJsScriptStore((state) => state.setPackages);
  const setSecrets = useJsScriptStore((state) => state.setSecrets);
  const setTimeoutSeconds = useJsScriptStore(
    (state) => state.setTimeoutSeconds
  );

  const handleInputs = useCallback(
    (inputs: JsScriptPort[]) => setPorts(scriptId, { inputs }),
    [scriptId, setPorts]
  );
  const handleOutputs = useCallback(
    (outputs: JsScriptPort[]) => setPorts(scriptId, { outputs }),
    [scriptId, setPorts]
  );
  const handlePackages = useCallback(
    (packages: SandboxModuleDeclaration[]) => setPackages(scriptId, packages),
    [scriptId, setPackages]
  );
  const handleSecrets = useCallback(
    (secrets: string[]) => setSecrets(scriptId, secrets),
    [scriptId, setSecrets]
  );

  return (
    <ScrollArea>
      <FlexColumn gap={SPACING.lg} padding={2}>
        <FlexColumn gap={SPACING.xs}>
          <TextInput
            label="Description"
            size="small"
            multiline
            minRows={2}
            value={document.description}
            placeholder="What this script does"
            disabled={readOnly}
            onChange={(event) =>
              setDescription(scriptId, event.target.value)
            }
          />
          <Text size="small" color="secondary">
            Agents read this to decide whether to call the script.
          </Text>
        </FlexColumn>

        <Divider />
        <JsScriptPortsEditor
          label="Inputs"
          ports={document.inputs}
          readOnly={readOnly}
          onChange={handleInputs}
        />
        <JsScriptPortsEditor
          label="Outputs"
          ports={document.outputs}
          readOnly={readOnly}
          onChange={handleOutputs}
        />

        <Divider />
        <JsScriptPackagesEditor
          packages={document.packages}
          readOnly={readOnly}
          onChange={handlePackages}
        />

        <Divider />
        <JsScriptSecretsEditor
          secrets={document.secrets}
          readOnly={readOnly}
          onChange={handleSecrets}
        />

        <Divider />
        <TextInput
          label={`Timeout (seconds, max ${JS_SCRIPT_MAX_TIMEOUT_SECONDS})`}
          size="small"
          type="number"
          value={String(document.timeoutSeconds)}
          disabled={readOnly}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (Number.isFinite(parsed)) {
              setTimeoutSeconds(scriptId, parsed);
            }
          }}
        />
      </FlexColumn>
    </ScrollArea>
  );
};

export default memo(JsScriptSettingsPanel);
