/** The hook that keeps a sketch's file in step with its row. */
import { ImageDocument, setImageDocumentFileSync } from "../src/index.js";
import { USER, describeDocumentFileHook } from "./_helpers/document-file-hook.js";

describeDocumentFileHook("the sketch file sync hook", {
  memberType: "sketch",
  install: setImageDocumentFileSync,
  make: (fields = {}) =>
    ImageDocument.create<ImageDocument>({
      user_id: USER,
      project_id: "project-a",
      name: "Fox",
      ...fields
    }),
  reload: (id) => ImageDocument.findById(id),
  rename: (id, updatedAt, name) =>
    ImageDocument.updateFieldsIfUnchanged(id, updatedAt, { name }),
  insertNew: (data) => ImageDocument.insertNew(data),
  setFileState: (id, state) => ImageDocument.setFileState(id, state)
});
