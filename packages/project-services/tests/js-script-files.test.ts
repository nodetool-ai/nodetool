/**
 * JS scripts as files in the project folder:
 * `JsScripts/<name>.jsscript.json`. An import keeps the script as it was as
 * a version.
 */
import {
  JsScript,
  JsScriptVersion,
  setJsScriptFileSync,
  type DocumentFileSync
} from "@nodetool-ai/models";
import { emptyJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import {
  PROJECT,
  USER,
  describeDocumentFiles
} from "./_helpers/document-kind-files.js";
import { jsScriptFileAdapter } from "../src/js-script-file.js";

function documentWith(marker: string): Record<string, unknown> {
  return { ...emptyJsScriptDocument(), description: marker };
}

describeDocumentFiles("JS script files", {
  memberType: "jsscript",
  directory: "JsScripts",
  suffix: ".jsscript.json",
  format: "nodetool.jsscript",
  adapter: jsScriptFileAdapter,
  install: (sync) =>
    setJsScriptFileSync(sync as DocumentFileSync<JsScript> | null),
  make: (name, marker) =>
    JsScript.create<JsScript>({
      user_id: USER,
      project_id: PROJECT,
      name,
      document: JSON.stringify(documentWith(marker))
    }),
  reload: (id) => JsScript.findById(id),
  async rename(row, name) {
    await JsScript.updateFieldsIfUnchanged(row.id, row.updated_at, { name });
  },
  markerOf: (row) => row.toDocument().description,
  setMarker: (file, marker) => {
    (file["document"] as Record<string, unknown>)["description"] = marker;
  },
  // save_js_script refuses a body that sends to an output it does not
  // declare, and so does the import.
  breakFile: (file) => {
    (file["document"] as Record<string, unknown>)["code"] = 'emit("nope", 1);';
  },
  newBody: (marker) => ({ document: documentWith(marker) }),
  versionCount: async (id) => (await JsScriptVersion.listForScript(id)).length
});
