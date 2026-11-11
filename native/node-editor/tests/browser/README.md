# Workflow browser service checks

Build and run independently of npm and the native editor host:

```sh
cmake -S native/node-editor/tests/browser \
  -B "$HOME/.cache/nodetool-native-builds/browser" \
  -DCMAKE_PREFIX_PATH=<Qt 6.12 install prefix>
cmake --build "$HOME/.cache/nodetool-native-builds/browser" -j4
ctest --test-dir "$HOME/.cache/nodetool-native-builds/browser" --output-on-failure
```

Set `NODETOOL_BROWSER_LIVE_URL` to enable the live contract test. It creates,
renames and deletes its own disposable workflow. It never deletes a workflow
from the list. `NODETOOL_TOKEN` optionally supplies authentication in memory.

The service follows the existing contracts in
[REST handlers](../../../../packages/websocket/src/http-api.ts),
[workflow writes](../../../../packages/websocket/src/lib/workflow-service.ts),
and [project choices](../../../../packages/websocket/src/trpc/routers/projects.ts).
The web [WorkflowList](../../../../web/src/components/workflows/WorkflowList.tsx)
also filters workflow names locally after loading pages.

Configure the origin and credentials, then call `refresh()` for the first page.
`setProjectId()` cancels stale requests and refreshes the new scope. An empty
project ID means all authorized workflows, matching the REST list contract.
`search` filters the loaded pages, and `hasNext` remains available during search.
Call `loadNext()` to extend the searched collection. `rows` retain full IDs.

Call `loadProjects()` while the workflow list and mutations are idle. Wait for
`projectsLoading` to become false before creating or renaming a workflow.
Operations emit `changed`, with separate `created`, `renamed` and `deleted`
signals carrying full IDs. Successful mutations refresh the list. The host owns
confirmation before delete and deciding whether to open a newly created ID.
The service never opens or changes the editor document.

Rename reads the latest workflow and sends its preserved fields and revision
back with the new name. This is required because the shared update service
requires the graph and replaces several metadata fields on update. HTTP
conflicts become errors, and an explicit retry reads the latest revision.
