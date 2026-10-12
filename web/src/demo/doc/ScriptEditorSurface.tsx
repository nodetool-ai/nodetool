import { Box, FlexRow } from "../../components/ui_primitives";
import ScriptCastPanel from "../../components/script/ScriptCastPanel";
import ScriptDocumentPane from "../../components/script/ScriptDocumentPane";
import type { ScriptCastDoc } from "./docCastTypes";

/** The script editor as the workspace lays it out: cast rail, then lines. */
export function ScriptEditorSurface({
  scriptId,
  doc
}: {
  scriptId: string;
  doc: ScriptCastDoc;
}): React.JSX.Element {
  return (
    <FlexRow fullHeight sx={{ alignItems: "stretch", minWidth: 0 }}>
      <Box
        data-focus-id="script-cast"
        sx={{
          width: 300,
          flexShrink: 0,
          borderRight: "1px solid",
          borderColor: "divider",
          backgroundColor: "background.default"
        }}
      >
        <ScriptCastPanel scriptId={scriptId} cast={doc.cast} readOnly />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <ScriptDocumentPane scriptId={scriptId} readOnly />
      </Box>
    </FlexRow>
  );
}
