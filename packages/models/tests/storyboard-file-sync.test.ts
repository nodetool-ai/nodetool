/** The hook that keeps a storyboard's file in step with its row. */
import { Storyboard, setStoryboardFileSync } from "../src/index.js";
import { USER, describeDocumentFileHook } from "./_helpers/document-file-hook.js";

describeDocumentFileHook("the storyboard file sync hook", {
  memberType: "storyboard",
  install: setStoryboardFileSync,
  make: (fields = {}) =>
    Storyboard.create<Storyboard>({
      user_id: USER,
      project_id: "project-a",
      name: "Board",
      ...fields
    }),
  reload: (id) => Storyboard.findById(id),
  rename: (id, updatedAt, name) =>
    Storyboard.updateFieldsIfUnchanged(id, updatedAt, { name }),
  insertNew: (data) => Storyboard.insertNew(data),
  setFileState: (id, state) => Storyboard.setFileState(id, state)
});
