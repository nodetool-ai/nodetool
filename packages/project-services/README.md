# @nodetool-ai/project-services

HTTP-independent project services. The HTTP routes and the `nodetool` CLI
commands share them, so a file exported by one imports through the other.

The package root exports the project archive, the timeline bundle and the zip
writer. Other modules are reached by subpath, such as
`@nodetool-ai/project-services/project-index`.

| Area | Modules | What they do |
|---|---|---|
| Project file | `project-archive`, `project-archive-host` | A `.nodetool-project` zip holds `manifest.json` (with a sha256 for every file), `records.json` (every project row), `assets/<id><ext>` and `workspaces/<id>/…`. `.nodetool/` stays out, and an import writes a manifest of its own. `projectArchiveHost()` supplies the asset and workspace storage. |
| Timeline bundle | `timeline-bundle` | Packs a timeline with its assets and fonts into a zip, unpacks it with bounded decompression, verifies checksums, and imports it with new asset ids. Assets the install no longer has are listed in the manifest and do not fail the export. |
| Zip output | `zip-stream` | `ZipStreamWriter`, `streamZip` and `collectZip` build archives from memory or local files without loading every asset at once. `MAX_ZIP_ENTRY_BYTES` caps one entry. |
| Document files | `workflow-file`, `script-file`, `js-script-file`, `sketch-file`, `storyboard-file`, `timeline-file`, `app-file`, `document-file-sync` | Keep each document type, as a readable JSON file in the project folder, in step with its database row. |
| Project folder | `project-folder-scan`, `project-folder-migration`, `project-folder-restore`, `folder-trash`, `project-erase`, `project-watch`, `workspace-files` | Scan, migrate and watch the project folder, restore one another install wrote, and move a deleted project's folder to the OS trash (Linux and macOS). |
| Transfer | `transfer-documents`, `transfer-files`, `transfer-conversations`, `cloud-transfer`, `cloud-send-client`, `cloud-receive`, `cloud-receive-client`, `cloud-http-transport`, `cloud-origin` | Send a project to a cloud install: open a transfer with a manifest, stage its files, then commit in one database transaction. |
| Examples | `example-catalog`, `example-workflows` | The shipped example workflow catalog. |

Run its tests with `npm run test --workspace=packages/project-services`.
