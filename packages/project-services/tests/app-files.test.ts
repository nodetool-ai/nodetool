/**
 * Mini apps as files in the project folder: `Apps/<name>.app.json`. An edit
 * is no release, so an import leaves no version.
 */
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import {
  Application,
  setApplicationFileSync,
  type DocumentFileSync
} from "@nodetool-ai/models";
import {
  PROJECT,
  USER,
  describeDocumentFiles
} from "./_helpers/document-kind-files.js";
import { appFileAdapter } from "../src/app-file.js";

describeDocumentFiles("app files", {
  memberType: "application",
  directory: "Apps",
  suffix: ".app.json",
  format: "nodetool.app",
  adapter: appFileAdapter,
  install: (sync) =>
    setApplicationFileSync(sync as DocumentFileSync<Application> | null),
  make: (name, marker) =>
    Application.create<Application>({
      user_id: USER,
      project_id: PROJECT,
      name,
      description: marker,
      document: JSON.stringify(createEmptyDocument())
    }),
  reload: (id) => Application.findById(id),
  async rename(row, name) {
    await Application.updateFieldsIfUnchanged(row.id, row.updated_at, { name });
  },
  markerOf: (row) => row.description,
  setMarker: (file, marker) => {
    file["description"] = marker;
  },
  breakFile: (file) => {
    file["description"] = "broken";
    (file["document"] as Record<string, unknown>)["ui"] = "not a page";
  },
  newBody: (marker) => ({
    description: marker,
    document: createEmptyDocument()
  })
});
