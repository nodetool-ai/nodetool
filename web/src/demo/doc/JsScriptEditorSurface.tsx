import {
  Box,
  FlexColumn,
  FlexRow,
  SPACING
} from "../../components/ui_primitives";
import JsScriptEditorPane from "../../components/jsScript/JsScriptEditorPane";
import JsScriptRunConsole from "../../components/jsScript/JsScriptRunConsole";
import JsScriptSettingsPanel from "../../components/jsScript/JsScriptSettingsPanel";

interface JsScriptEditorSurfaceProps {
  scriptId: string;
}

export function JsScriptEditorSurface({
  scriptId
}: JsScriptEditorSurfaceProps): React.JSX.Element {
  return (
    <FlexColumn fullHeight gap={SPACING.md} sx={{ minWidth: 0 }}>
      <FlexRow
        gap={SPACING.md}
        sx={{ alignItems: "stretch", minWidth: 0, minHeight: 0, flex: 1 }}
      >
        <Box
          sx={{ flex: 1, minWidth: 0, "& .cursor": { visibility: "hidden" } }}
        >
          <JsScriptEditorPane
            scriptId={scriptId}
            readOnly
            deterministicReadOnly
          />
        </Box>
        <Box sx={{ width: 360, flexShrink: 0 }}>
          <JsScriptSettingsPanel scriptId={scriptId} readOnly />
        </Box>
      </FlexRow>
      <Box data-focus-id="jsscript-tests" sx={{ height: 300, flexShrink: 0 }}>
        <JsScriptRunConsole
          scriptId={scriptId}
          readOnly
          onRun={() => undefined}
          onTest={() => undefined}
        />
      </Box>
    </FlexColumn>
  );
}
