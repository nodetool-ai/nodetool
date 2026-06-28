/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import { Puck, type Data, type Overrides } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import CloseIcon from "@mui/icons-material/Close";

import { Workflow } from "../../../stores/ApiTypes";
import { extractWorkflowState } from "../workflowState";
import { useAppRuntime } from "../runtime/useAppRuntime";
import { AppRuntimeContext } from "../runtime/AppRuntimeContext";
import { BuilderWorkflowProvider } from "./BuilderWorkflowContext";
import { appConfig } from "./config";
import { Box, EditorButton } from "../../ui_primitives";

interface PuckAppEditorProps {
  workflow: Workflow;
  data: Data;
  onPublish: (data: Data) => void;
  onChange?: (data: Data) => void;
  onClose: () => void;
}

/**
 * The WYSIWYG editor: Puck draws the editing chrome (component drawer, canvas,
 * field inspector) while our contexts supply the bindable workflow surface and
 * an inert design-mode runtime so widget previews render without running.
 */
const PuckAppEditor: React.FC<PuckAppEditorProps> = ({
  workflow,
  data,
  onPublish,
  onChange,
  onClose
}) => {
  const workflowState = useMemo(
    () => extractWorkflowState(workflow),
    [workflow]
  );
  const designRuntime = useAppRuntime(workflow, true);

  const overrides = useMemo<Partial<Overrides>>(
    () => ({
      headerActions: ({ children }) => (
        <>
          <EditorButton
            size="small"
            variant="text"
            startIcon={<CloseIcon sx={{ fontSize: 16 }} />}
            onClick={onClose}
          >
            Close
          </EditorButton>
          {children}
        </>
      )
    }),
    [onClose]
  );

  return (
    <BuilderWorkflowProvider value={workflowState}>
      <AppRuntimeContext.Provider value={designRuntime}>
        <Box className="appbuilder-editor" sx={{ width: "100%", height: "100%" }}>
          <Puck
            config={appConfig}
            data={data}
            onPublish={onPublish}
            onChange={onChange}
            overrides={overrides}
            iframe={{ enabled: false }}
          />
        </Box>
      </AppRuntimeContext.Provider>
    </BuilderWorkflowProvider>
  );
};

export default PuckAppEditor;
