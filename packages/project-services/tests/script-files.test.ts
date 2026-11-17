/**
 * Scripts as files in the project folder: `Scripts/<name>.script.json`.
 * Scripts keep no versions, so an import leaves none.
 */
import {
  Script,
  emptyScriptDocument,
  setScriptFileSync,
  type DocumentFileSync
} from "@nodetool-ai/models";
import {
  PROJECT,
  USER,
  describeDocumentFiles
} from "./_helpers/document-kind-files.js";
import { scriptFileAdapter } from "../src/script-file.js";

/** A document whose only speaker is named `marker`. */
function documentWith(marker: string): Record<string, unknown> {
  return { ...emptyScriptDocument(), cast: [{ id: "s1", name: marker }] };
}

function castOf(file: Record<string, unknown>): Array<Record<string, unknown>> {
  return (file["document"] as Record<string, unknown>)["cast"] as Array<
    Record<string, unknown>
  >;
}

describeDocumentFiles("script files", {
  memberType: "script",
  directory: "Scripts",
  suffix: ".script.json",
  format: "nodetool.script",
  adapter: scriptFileAdapter,
  install: (sync) => setScriptFileSync(sync as DocumentFileSync<Script> | null),
  make: (name, marker) =>
    Script.create<Script>({
      user_id: USER,
      project_id: PROJECT,
      name,
      document: JSON.stringify(documentWith(marker))
    }),
  reload: (id) => Script.findById(id),
  async rename(row, name) {
    await Script.updateFieldsIfUnchanged(row.id, row.updated_at, { name });
  },
  markerOf: (row) => row.toDocument().cast[0]?.name ?? "",
  setMarker: (file, marker) => {
    castOf(file)[0]!["name"] = marker;
  },
  breakFile: (file) => {
    (file["document"] as Record<string, unknown>)["sections"] = "not a list";
  },
  newBody: (marker) => ({ document: documentWith(marker) })
});
