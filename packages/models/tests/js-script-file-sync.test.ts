/** The hook that keeps a JS script's file in step with its row. */
import { JsScript, setJsScriptFileSync } from "../src/index.js";
import { USER, describeDocumentFileHook } from "./_helpers/document-file-hook.js";

describeDocumentFileHook("the JS script file sync hook", {
  memberType: "jsscript",
  install: setJsScriptFileSync,
  make: (fields = {}) =>
    JsScript.create<JsScript>({
      user_id: USER,
      project_id: "project-a",
      name: "Tool",
      ...fields
    }),
  reload: (id) => JsScript.findById(id),
  rename: (id, updatedAt, name) =>
    JsScript.updateFieldsIfUnchanged(id, updatedAt, { name }),
  insertNew: (data) => JsScript.insertNew(data),
  setFileState: (id, state) => JsScript.setFileState(id, state)
});
