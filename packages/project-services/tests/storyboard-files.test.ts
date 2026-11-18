/**
 * Storyboards as files in the project folder:
 * `Storyboards/<name>.storyboard.json`. Storyboards keep no versions, so an
 * import leaves none.
 */
import {
  Storyboard,
  emptyStoryboardDocument,
  setStoryboardFileSync,
  type DocumentFileSync
} from "@nodetool-ai/models";
import {
  PROJECT,
  USER,
  describeDocumentFiles
} from "./_helpers/document-kind-files.js";
import { storyboardFileAdapter } from "../src/storyboard-file.js";

function documentOf(file: Record<string, unknown>): Record<string, unknown> {
  return file["document"] as Record<string, unknown>;
}

describeDocumentFiles("storyboard files", {
  memberType: "storyboard",
  directory: "Storyboards",
  suffix: ".storyboard.json",
  format: "nodetool.storyboard",
  adapter: storyboardFileAdapter,
  install: (sync) =>
    setStoryboardFileSync(sync as DocumentFileSync<Storyboard> | null),
  make: (name, marker) =>
    Storyboard.create<Storyboard>({
      user_id: USER,
      project_id: PROJECT,
      name,
      document: JSON.stringify({ ...emptyStoryboardDocument(), brief: marker })
    }),
  reload: (id) => Storyboard.findById(id),
  async rename(row, name) {
    await Storyboard.updateFieldsIfUnchanged(row.id, row.updated_at, { name });
  },
  markerOf: (row) => row.toDocument().brief,
  setMarker: (file, marker) => {
    documentOf(file)["brief"] = marker;
  },
  breakFile: (file) => {
    documentOf(file)["shots"] = "not a list";
  },
  newBody: (marker) => ({
    document: { ...emptyStoryboardDocument(), brief: marker }
  })
});
