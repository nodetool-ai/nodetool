/** The hook that keeps a script's file in step with its row. */
import { Script, setScriptFileSync } from "../src/index.js";
import { USER, describeDocumentFileHook } from "./_helpers/document-file-hook.js";

describeDocumentFileHook("the script file sync hook", {
  memberType: "script",
  install: setScriptFileSync,
  make: (fields = {}) =>
    Script.create<Script>({
      user_id: USER,
      project_id: "project-a",
      name: "Script",
      ...fields
    }),
  reload: (id) => Script.findById(id),
  rename: (id, updatedAt, name) =>
    Script.updateFieldsIfUnchanged(id, updatedAt, { name }),
  insertNew: (data) => Script.insertNew(data),
  setFileState: (id, state) => Script.setFileState(id, state)
});
