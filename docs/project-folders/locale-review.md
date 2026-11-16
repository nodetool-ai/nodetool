# Locale strings that need a native-speaker review

The delete-project dialog for project folders (PF15, PR #7613) added or changed
nine strings. All 15 non-English locale files carry a translation of each. An
agent wrote those translations and no native speaker has read them. The English
text is the source.

All keys are under `pass3_33.projects.lifecycle` in
`web/src/i18n/locales/<language>.json`.

| Key | English source |
|---|---|
| `confirmDeleteBody` (changed) | Delete {{projectName}} and all of its documents, conversations, jobs, and assets stored outside the project folder. |
| `deleteFolderTrash` | The project folder moves to the trash. |
| `deleteFolderRemove` | The project folder and every file in it are deleted from cloud storage. |
| `deleteFolderKeep` | The project folder stays where it is with every file in it. NodeTool removes only the .nodetool folder inside it. |
| `deleteFolderMissing` | The project folder cannot be reached, so NodeTool leaves it as it is. |
| `folderMovedAsideTo` | The trash could not be reached. The project folder moved to {{path}}. |
| `folderMovedAside` | The trash could not be reached. The project folder moved to the .trash folder in the projects folder. |
| `folderTrashFailedAt` | The project folder could not be moved to the trash. It stays at {{path}}. |
| `folderTrashFailed` | The project folder could not be moved to the trash. It stays where it is. |

Languages to review: `de`, `es`, `fi`, `fr`, `hi`, `it`, `ja`, `ko`, `nb`, `nl`,
`pl`, `pt`, `ru`, `sv`, `zh-CN`.

Check three things in each language:

1. The meaning of `confirmDeleteBody` changed. It no longer says project files
   are deleted, because the dialog now states what happens to the folder in the
   next line.
2. The word for "project folder" is the same in all nine strings and matches the
   Files tab.
3. `{{projectName}}` and `{{path}}` are untouched, and `.nodetool` and `.trash`
   stay as written.

## Project folder migration

The migration dialog and progress panel (issue #7634) added 36 strings under
`projectFolder.migration` in `web/src/i18n/locales/<language>.json`. An agent
wrote all 15 translations and no native speaker has read them. The English
text in `en.json` is the source.

Check four things in each language:

1. The word for "project folder" matches `projectFolder.name` and the strings
   above.
2. `permissionWarning` uses the names macOS shows for Documents, Desktop and
   Downloads in that language. The `fi`, `sv`, `nb`, `pt` and `ko` names were
   written without a Mac to check them against, and `hi` keeps the English
   names.
3. `safety` says that no file is lost and that the old copy is removed only
   after the copy is checked. It must not say that nothing is deleted.
4. `{{project}}`, `{{folder}}`, `{{error}}`, `{{done}}`, `{{total}}`,
   `{{count}}`, `{{name}}`, `{{reason}}` and `{{path}}` are untouched, and
   NodeTool, macOS and iCloud Drive stay as written.
