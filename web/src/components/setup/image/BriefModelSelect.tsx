import { isModelSelected } from "@nodetool-ai/protocol";
import { Box, FlexColumn, GAP, Label } from "../../ui_primitives";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { SetupFooterField } from "../SetupFooterField";

function BriefModelPicker({ readOnly = false }: { readOnly?: boolean }) {
  const model = useGlobalChatStore((state) => state.selectedModel);
  const setSelectedModel = useGlobalChatStore((state) => state.setSelectedModel);
  return (
    <LanguageModelSelect
      value={isModelSelected(model) ? model.id : ""}
      provider={model?.provider}
      onChange={setSelectedModel}
      placeholder="Brief model"
      disabled={readOnly}
    />
  );
}

/** The brief model, for the shell's footer beside the estimate it prices. */
export function BriefModelFooterField({ readOnly }: { readOnly?: boolean }) {
  return (
    <SetupFooterField label="Model">
      <BriefModelPicker readOnly={readOnly} />
    </SetupFooterField>
  );
}

export default function BriefModelSelect() {
  return (
    <FlexColumn gap={GAP.normal}>
      <Label>Language model for the brief</Label>
      <Box sx={{ width: "100%", maxWidth: 320 }}>
        <BriefModelPicker />
      </Box>
    </FlexColumn>
  );
}
