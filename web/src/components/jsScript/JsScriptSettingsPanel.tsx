/**
 * The JS script's execution envelope, side by side in one panel: what the
 * script says it does, the ports it declares, the secrets it may read, the
 * timeout it runs under, and whether it shows up in the node menu. Every installed sandbox pack and every platform
 * module resolves by import — there is no packages setting. Every field
 * writes straight into the document, which autosaves.
 */
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";

import {
  Divider,
  FlexColumn,
  LabeledSwitch,
  ScrollArea,
  NumberField,
  TextArea,
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
import JsScriptSecretsEditor from "./JsScriptSecretsEditor";

/** What a newly exposed script lands under until its owner names a category. */
const DEFAULT_CATEGORY = "My Nodes";

interface JsScriptSettingsPanelProps {
  scriptId: string;
  readOnly?: boolean;
}

const JsScriptSettingsPanel = ({
  scriptId,
  readOnly = false
}: JsScriptSettingsPanelProps) => {
  const { t, i18n } = useTranslation("translation", { keyPrefix: "screen_scripts_js" });
  const document = useJsScriptDocument(scriptId);
  const setDescription = useJsScriptStore((state) => state.setDescription);
  const setPorts = useJsScriptStore((state) => state.setPorts);
  const setSecrets = useJsScriptStore((state) => state.setSecrets);
  const setTimeoutSeconds = useJsScriptStore(
    (state) => state.setTimeoutSeconds
  );
  const setPalette = useJsScriptStore((state) => state.setPalette);

  const handleInputs = useCallback(
    (inputs: JsScriptPort[]) => setPorts(scriptId, { inputs }),
    [scriptId, setPorts]
  );
  const handleOutputs = useCallback(
    (outputs: JsScriptPort[]) => setPorts(scriptId, { outputs }),
    [scriptId, setPorts]
  );
  const handleSecrets = useCallback(
    (secrets: string[]) => setSecrets(scriptId, secrets),
    [scriptId, setSecrets]
  );
  const handleShowInMenu = useCallback(
    (checked: boolean) =>
      setPalette(scriptId, checked ? { category: DEFAULT_CATEGORY } : null),
    [scriptId, setPalette]
  );

  return (
    <ScrollArea>
      <FlexColumn gap={SPACING.lg} padding={2}>
        <TextArea
          label={t("settings.description")}
          size="small"
          minRows={1}
          value={document.description}
          placeholder={t("settings.descriptionPlaceholder")}
          helperText={t("settings.descriptionHelp")}
          disabled={readOnly}
          onChange={(value) =>
            setDescription(scriptId, value)
          }
        />

        <Divider />
        <FlexColumn data-focus-id="jsscript-ports" gap={SPACING.lg}>
          <JsScriptPortsEditor
            label={t("ports.inputs")}
            ports={document.inputs}
            readOnly={readOnly}
            onChange={handleInputs}
          />
          <JsScriptPortsEditor
            label={t("ports.outputs")}
            ports={document.outputs}
            readOnly={readOnly}
            onChange={handleOutputs}
          />
        </FlexColumn>

        <Divider />
        <JsScriptSecretsEditor
          secrets={document.secrets}
          readOnly={readOnly}
          onChange={handleSecrets}
        />

        <Divider />
        <FlexColumn gap={SPACING.lg}>
          <LabeledSwitch
          label={t("settings.showInNodeMenu")}
            size="small"
            checked={document.palette !== undefined}
            disabled={readOnly}
            onChange={handleShowInMenu}
            description={t("settings.showInNodeMenuHelp")}
          />
          {document.palette !== undefined ? (
            <TextInput
              label={t("settings.category")}
              size="small"
              value={document.palette.category}
              placeholder={DEFAULT_CATEGORY}
              disabled={readOnly}
              onChange={(event) =>
                setPalette(scriptId, { category: event.target.value })
              }
            />
          ) : null}
        </FlexColumn>

        <Divider />
        <NumberField
          label={t("settings.timeout", { max: new Intl.NumberFormat(i18n.language).format(JS_SCRIPT_MAX_TIMEOUT_SECONDS) })}
          size="small"
          min={0}
          max={JS_SCRIPT_MAX_TIMEOUT_SECONDS}
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
