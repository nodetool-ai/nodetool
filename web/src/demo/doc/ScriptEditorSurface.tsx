import { Box, FlexRow, SPACING } from "../../components/ui_primitives";
import ScriptCastPanel from "../../components/script/ScriptCastPanel";
import ScriptDocumentPane from "../../components/script/ScriptDocumentPane";
import type { ScriptCastDoc } from "./docCastTypes";

export function ScriptEditorSurface({
  scriptId,
  doc
}: {
  scriptId: string;
  doc: ScriptCastDoc;
}): React.JSX.Element {
  return (
    <FlexRow fullHeight gap={SPACING.md} sx={{ alignItems: "stretch", minWidth: 0 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <ScriptDocumentPane scriptId={scriptId} readOnly />
      </Box>
      <Box sx={{ width: 300, flexShrink: 0 }}>
        <Box data-focus-id="script-cast">
          <ScriptCastPanel scriptId={scriptId} cast={doc.cast} readOnly />
        </Box>
      </Box>
    </FlexRow>
  );
}
