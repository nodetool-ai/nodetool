// builtin/index.ts
// -----------------------------------------------------------------
// The one list of built-in frontend tool modules. Importing this module
// registers all of them with the FrontendToolRegistry via side effect.
//
// Two entry points load frontend tools — the browser app (`src/index.tsx`,
// lazily after first render) and the agent WebSocket bridge
// (`frontendToolsIpc.ts`). They used to keep separate lists that had drifted
// apart, so the editor tools existed on one path and not the other and the
// manifest depended on which shell you were in. Both now go through here.
//
// Note this is registration, not availability: every editor tool takes a
// required document id and resolves it against the documents actually open,
// so registering a tool the user can't currently use is harmless — it fails
// with a message naming the open ids, and `ui_open_document` opens one that
// isn't.
// -----------------------------------------------------------------

// Graph editor.
import "./graph";
import "./addNode";
import "./updateNodeData";
import "./connectNodes";
import "./setNodeTitle";
import "./moveNode";
import "./getGraph";
import "./deleteNode";
import "./deleteEdge";

// Discovery.
import "./searchNodes";
import "./searchModels";

// App-level actions (open/run workflow, switch tab, copy/paste).
import "./uiActions";

// Opening a document as a workspace tab, so the editor tools below can act
// on documents the user does not already have open.
import "./openDocument";

// Editor surfaces.
import "./timeline";
import "./storyboard";
import "./sketch";
import "./script";
import "./jsscript";
import "./puck";
import "./model3d";
import "./code";

// Entity assets.
import "./entities";
