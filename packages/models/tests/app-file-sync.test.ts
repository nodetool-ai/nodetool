/** The hook that keeps an app's file in step with its row. */
import { Application, setApplicationFileSync } from "../src/index.js";
import { USER, describeDocumentFileHook } from "./_helpers/document-file-hook.js";

describeDocumentFileHook("the app file sync hook", {
  memberType: "application",
  install: setApplicationFileSync,
  make: (fields = {}) =>
    Application.create<Application>({
      user_id: USER,
      project_id: "project-a",
      name: "App",
      ...fields
    }),
  reload: (id) => Application.findById(id),
  rename: (id, updatedAt, name) =>
    Application.updateFieldsIfUnchanged(id, updatedAt, { name }),
  insertNew: (data) => Application.insertNew(data),
  setFileState: (id, state) => Application.setFileState(id, state)
});
