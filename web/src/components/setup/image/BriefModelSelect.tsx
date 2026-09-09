import { isModelSelected } from "@nodetool-ai/protocol";
import { Box, FlexColumn, GAP, Label } from "../../ui_primitives";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import useGlobalChatStore from "../../../stores/GlobalChatStore";

export default function BriefModelSelect() {
  const model = useGlobalChatStore((state) => state.selectedModel);
  const setSelectedModel = useGlobalChatStore((state) => state.setSelectedModel);

  return (
    <FlexColumn gap={GAP.normal}>
      <Label>Language model for the brief</Label>
      <Box sx={{ width: "100%", maxWidth: 320 }}>
        <LanguageModelSelect
          value={isModelSelected(model) ? model.id : ""}
          provider={model?.provider}
          onChange={setSelectedModel}
          placeholder="Select language model"
        />
      </Box>
    </FlexColumn>
  );
}
