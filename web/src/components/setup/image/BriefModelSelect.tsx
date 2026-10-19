import { isModelSelected } from "@nodetool-ai/protocol";
import { useTranslation } from "react-i18next";
import { FormField } from "../../ui_primitives";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { SetupFooterField } from "../SetupFooterField";

function BriefModelPicker({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useTranslation();
  const model = useGlobalChatStore((state) => state.selectedModel);
  const setSelectedModel = useGlobalChatStore(
    (state) => state.setSelectedModel
  );
  return (
    <LanguageModelSelect
      value={isModelSelected(model) ? model.id : ""}
      provider={model?.provider}
      onChange={setSelectedModel}
      placeholder={t("pass3_7.imageSetup.briefModel.placeholder")}
      disabled={readOnly}
    />
  );
}

/** The brief model, for the shell's footer beside the estimate it prices. */
export function BriefModelFooterField({ readOnly }: { readOnly?: boolean }) {
  const { t } = useTranslation();
  return (
    <SetupFooterField label={t("pass3_7.imageSetup.briefModel.label")}>
      <BriefModelPicker readOnly={readOnly} />
    </SetupFooterField>
  );
}

export default function BriefModelSelect() {
  const { t } = useTranslation();
  return (
    <FormField
      label={t("pass3_7.imageSetup.briefModel.fieldLabel")}
      sx={{ width: "100%", maxWidth: 320 }}
    >
      <BriefModelPicker />
    </FormField>
  );
}
