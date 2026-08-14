import { memo } from "react";
import ViewInArIcon from "@mui/icons-material/ViewInAr";

import AssistantChatPanel from "../chat/assistant/AssistantChatPanel";

/**
 * Chat surface for the 3D model editor. The `ui_3d_*` tools act on the
 * mounted scene, so this panel only needs a source tag — there is no
 * document id for those tools.
 */
const Model3DChatPanel = () => {
  return (
    <AssistantChatPanel
      chatSource="model3d_assistant"
      WelcomeIcon={ViewInArIcon}
      welcomeTitle="3D Assistant"
      welcomeBody='Ask me to build and edit the scene — e.g. "add a red box and a sphere above it", "make the floor blue", or "list everything in the scene".'
    />
  );
};

export default memo(Model3DChatPanel);
