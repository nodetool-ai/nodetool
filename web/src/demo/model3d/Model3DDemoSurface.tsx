/**
 * Model3DDemoSurface — the 3D editor as a demo video shows it.
 *
 * The fourth replay surface, and the odd one out: there is no cast. The other
 * three players seek a recording; a 3D scene is a document that sits still,
 * and what moves in a shot of it is the camera. So this mounts the production
 * `Model3DEditor` on a scene file and hands it a camera pose the host drives —
 * one value per video frame — through the editor's own `cameraPose` prop.
 *
 * Save and close are no-ops for the same reason the other players are
 * read-only: a replay renders state, it never accepts input.
 */
import React, { useCallback } from "react";
import { MemoryRouter } from "react-router-dom";

import "../../styles/vars.css";
import "../../styles/base.css";

import { ThemeRoot } from "../../components/ui_primitives";
import ThemeNodetool from "../../components/themes/ThemeNodetool";
import { WorkflowManagerProvider } from "../../contexts/WorkflowManagerContext";
import { queryClient } from "../../queryClient";
import { TRPCProvider } from "../../trpc/Provider";
import Model3DEditor, {
  type Model3DCameraPose
} from "../../components/model_editor/Model3DEditor";

export interface Model3DDemoSurfaceProps {
  /** URL of the `.gltf`/`.glb` the editor loads. */
  url: string;
  /** Document name shown in the editor's header. */
  name?: string;
  /** Where the camera sits for the frame being rendered. */
  cameraPose: Model3DCameraPose;
}

export function Model3DDemoSurface({
  url,
  name,
  cameraPose
}: Model3DDemoSurfaceProps): React.JSX.Element {
  const noop = useCallback(() => {}, []);
  return (
    // The same provider shell DocDemoPlayer mounts: the editor reads the MUI
    // theme, react-router, and the query client the way it does in the app.
    <MemoryRouter>
      <TRPCProvider>
        <ThemeRoot theme={ThemeNodetool}>
          <WorkflowManagerProvider queryClient={queryClient}>
            <div style={{ width: "100%", height: "100%" }}>
              <Model3DEditor
                url={url}
                name={name}
                onSave={noop}
                onClose={noop}
                cameraPose={cameraPose}
                // The render has no network: drei's `Environment` preset would
                // suspend on an HDR it can never fetch and the frame would come
                // out blank.
                offlineLighting
              />
            </div>
          </WorkflowManagerProvider>
        </ThemeRoot>
      </TRPCProvider>
    </MemoryRouter>
  );
}

export default Model3DDemoSurface;
