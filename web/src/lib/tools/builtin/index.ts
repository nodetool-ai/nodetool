// builtin/index.ts
// -----------------------------------------------------------------
// The one list of built-in frontend tool modules. Importing this module
// registers all of them with the FrontendToolRegistry via side effect.
//
// The browser app loads this module lazily after its first render. Keeping the
// registrations in one place prevents the frontend tool catalog from drifting.
//
// Note this is registration, not availability: every editor tool takes a
// required document id and resolves it against the documents actually open,
// so registering a tool the user can't currently use is harmless — it fails
// with a message naming the open ids, and `ui_open_document` opens one that
// isn't.
// -----------------------------------------------------------------

// Graph editor.
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
