/**
 * What sandboxed code can reach of NodeTool's own API, and what it cannot.
 *
 * The capability registry (`@nodetool-ai/agents`, `src/capabilities/`) is the
 * whole surface a guest has: the `nodetool.*` imports, the agent toolbelt and
 * the MCP mount all resolve through it, and `http_request` cannot reach back
 * in because the fetch guard refuses loopback and private ranges. So every
 * procedure in this router either has a capability behind it or does not exist
 * as far as a run is concerned.
 *
 * Before this table, "does not exist" covered two very different things: a
 * surface deliberately kept out of a sandbox, and one nobody had got to yet.
 * They read identically from outside, which is how a security boundary rots —
 * the next person adding a router has no way to tell whether the omission next
 * to theirs was a decision. Each procedure therefore carries one of four
 * verdicts and, for three of them, a reason a reviewer can disagree with:
 *
 * - `capability` — the wire name a run calls instead. Checked to resolve.
 * - `elsewhere`  — reachable, by a differently-shaped capability.
 * - `withheld`   — deliberately out of reach, with the risk stated.
 * - `gap`        — not covered, and not for a security reason. Work, written
 *                  down as work.
 *
 * `tests/sandbox-api-coverage.test.ts` walks the live router and fails when
 * the two disagree in either direction, so a new procedure cannot land
 * unclassified and a stale line cannot outlive the procedure it describes.
 *
 * The recurring shape of the withheld set is worth naming, because it is the
 * rule to apply to the next one: a run may act on the rows its own user owns,
 * and may not touch credentials, billing, other tenants, host control, the
 * transcript of its own behaviour, or anything that grants a third party
 * access. Publishing is the one deliberate exception — `set_workflow_access`
 * exists and is classified `external`, so the gate asks a human first.
 */

/** Why one procedure is or is not reachable from sandboxed code. */
export type SandboxApiVerdict =
  | { readonly capability: string; readonly elsewhere?: never; readonly withheld?: never; readonly gap?: never }
  | { readonly elsewhere: string; readonly capability?: never; readonly withheld?: never; readonly gap?: never }
  | { readonly withheld: string; readonly capability?: never; readonly elsewhere?: never; readonly gap?: never }
  | { readonly gap: string; readonly capability?: never; readonly elsewhere?: never; readonly withheld?: never };

/**
 * Every tRPC procedure path, and what sandboxed code can do about it.
 *
 * Keyed by the dotted path `appRouter._def.procedures` uses, so the test can
 * compare this against the router itself rather than against a copy of it.
 */
export const SANDBOX_API_COVERAGE: Readonly<
  Record<string, SandboxApiVerdict>
> = {
  "agentAccess.createToken": {
    withheld:
      "Minting a bearer token is granting a third party the user's whole " +
      "account. A run that could mint one outlives every bound it has."
  },
  "agentAccess.listTokens": {
    withheld:
      "Enumerating a user's credentials, including which are live. Nothing " +
      "a run does needs the list."
  },
  "agentAccess.mcpConnection": {
    withheld:
      "Describes the remote-access surface and whether it checks a " +
      "credential. Reconnaissance for the two above."
  },
  "agentAccess.revokeToken": {
    withheld:
      "Revoking another agent's credential is denial of service against " +
      "the user's own tooling."
  },
  "agentAccess.getOauthRequest": {
    withheld:
      "Reads a pending OAuth consent request. The consent flow exists to put " +
      "a human between an MCP client and a credential; a run has no business " +
      "seeing what is waiting for that human."
  },
  "agentAccess.approveOauthRequest": {
    withheld:
      "Approving an OAuth consent mints an authorization code — a credential " +
      "grant. A run that could approve one connects an arbitrary client to " +
      "the user's account with no human in the loop."
  },
  "agentAccess.denyOauthRequest": {
    withheld:
      "The deny half of the same human-only consent decision. Letting a run " +
      "answer either way makes it the consent screen."
  },
  "agentAccess.listOauthGrants": {
    withheld:
      "Enumerates which MCP clients hold live grants — credential " +
      "reconnaissance, same rule as listTokens."
  },
  "agentAccess.revokeOauthGrant": {
    withheld:
      "Revoking a connected client's grant is denial of service against the " +
      "user's own tooling, same rule as revokeToken."
  },
  "applications.beginInvocation": {
    withheld:
      "Spend governance. A run that could raise its own ceiling is " +
      "not bounded by one."
  },
  "applications.budget": {
    withheld:
      "Spend governance. A run that could raise its own ceiling is " +
      "not bounded by one."
  },
  "applications.create": {
    gap:
      "Authoring an app is the `ui_app_*` editor contract and the " +
      "`app build` harness, not a capability — see " +
      "capabilities/apps.ts."
  },
  "applications.delete": { capability: "delete_app" },
  "applications.deploy": {
    withheld:
      "Deploying serves the app from a URL that needs no login and runs " +
      "on the owner's keys and budget. It is the strongest publishing " +
      "decision in the product, and a run that could make it could put " +
      "someone's account behind a link they never handed out."
  },
  "applications.deployment": {
    withheld:
      "The deployment token is the link. Reading it is handing out the " +
      "link, which is the same act as deploying."
  },
  "applications.undeploy": {
    withheld:
      "Withdrawing a link is the owner's call about who still reaches " +
      "their app. A run that could revoke one could take an app offline " +
      "for everyone using it."
  },
  "applications.get": { capability: "get_app" },
  "applications.invocations": {
    withheld:
      "Spend governance. A run that could raise its own ceiling is " +
      "not bounded by one."
  },
  "applications.list": { capability: "list_apps" },
  "applications.publish": {
    withheld:
      "Releasing publishes an app to people other than its author and " +
      "starts billing them against its budget. A run that could cut a " +
      "release could spend money in someone else's name."
  },
  "applications.release": {
    withheld:
      "Releasing publishes an app to people other than its author and " +
      "starts billing them against its budget. A run that could cut a " +
      "release could spend money in someone else's name."
  },
  "applications.released": {
    withheld:
      "Releasing publishes an app to people other than its author and " +
      "starts billing them against its budget. A run that could cut a " +
      "release could spend money in someone else's name."
  },
  "applications.releasedDocument": {
    gap:
      "Bundle import/export gathers the pinned workflow and script " +
      "sources through lib/applications-service.ts, which raises HTTP " +
      "errors; a copy in the sandbox would be a second implementation " +
      "of the pinning rules. Moving that service below the transport " +
      "is its own change."
  },
  "applications.setBudget": {
    withheld:
      "Spend governance. A run that could raise its own ceiling is " +
      "not bounded by one."
  },
  "applications.settleInvocation": {
    withheld:
      "Spend governance. A run that could raise its own ceiling is " +
      "not bounded by one."
  },
  "applications.update": {
    gap:
      "Authoring an app is the `ui_app_*` editor contract and the " +
      "`app build` harness, not a capability — see " +
      "capabilities/apps.ts."
  },
  "applications.usage": {
    withheld:
      "Spend governance. A run that could raise its own ceiling is " +
      "not bounded by one."
  },
  "applications.versions": {
    withheld:
      "Releasing publishes an app to people other than its author and " +
      "starts billing them against its budget. A run that could cut a " +
      "release could spend money in someone else's name."
  },
  "assets.createUpload": {
    elsewhere:
      "save_asset writes an asset from bytes, a workspace file or a " +
      "URL in one call. The two-step signed-upload handshake exists " +
      "for a browser streaming a large file straight to object " +
      "storage."
  },
  "assets.delete": {
    withheld:
      "Deleting an asset also deletes its stored bytes, and a folder " +
      "delete recurses through everything under it. The storage " +
      "cascade lives in the HTTP layer, and irreversible bulk loss of " +
      "a user's media library is the largest-blast-radius write in " +
      "the API — the wrong thing to put one prompt injection away."
  },
  "assets.finalizeUpload": {
    elsewhere:
      "save_asset writes an asset from bytes, a workspace file or a " +
      "URL in one call. The two-step signed-upload handshake exists " +
      "for a browser streaming a large file straight to object " +
      "storage."
  },
  "assets.get": { capability: "get_asset" },
  "assets.list": { capability: "list_assets" },
  "assets.recursive": {
    elsewhere:
      "Walk the tree with list_assets, which takes a parent."
  },
  "assets.search": { capability: "asset_search" },
  "assets.update": { capability: "update_asset" },
  "codeGen.generate": {
    elsewhere:
      "Sandboxed code authors node bodies with validate_code / " +
      "run_code / test_code."
  },
  "collections.create": { capability: "create_collection" },
  "collections.delete": { capability: "delete_collection" },
  "collections.list": { capability: "list_collections" },
  "collections.update": {
    gap:
      "Renaming a collection and editing its metadata. Reachable only " +
      "by recreating it today; not yet worth a capability of its own."
  },
  "costs.dashboard": { capability: "get_cost_summary" },
  "credits.setPlan": {
    withheld:
      "Billing. `status` reads a balance and the other two move " +
      "money; get_cost_summary covers what a run legitimately needs " +
      "to know about spend."
  },
  "credits.status": {
    withheld:
      "Billing. `status` reads a balance and the other two move " +
      "money; get_cost_summary covers what a run legitimately needs " +
      "to know about spend."
  },
  "credits.topup": {
    withheld:
      "Billing. `status` reads a balance and the other two move " +
      "money; get_cost_summary covers what a run legitimately needs " +
      "to know about spend."
  },
  "customProviders.delete": {
    withheld:
      "Custom providers hold API keys. `list` returns the configured " +
      "endpoints and `save`/`test` write and exercise credentials, so " +
      "the whole router is credential surface."
  },
  "customProviders.list": {
    withheld:
      "Custom providers hold API keys. `list` returns the configured " +
      "endpoints and `save`/`test` write and exercise credentials, so " +
      "the whole router is credential surface."
  },
  "customProviders.save": {
    withheld:
      "Custom providers hold API keys. `list` returns the configured " +
      "endpoints and `save`/`test` write and exercise credentials, so " +
      "the whole router is credential surface."
  },
  "customProviders.test": {
    withheld:
      "Custom providers hold API keys. `list` returns the configured " +
      "endpoints and `save`/`test` write and exercise credentials, so " +
      "the whole router is credential surface."
  },
  "extension.status": {
    gap:
      "Browser-extension liveness; nothing a headless run acts on."
  },
  "files.createFolder": {
    elsewhere:
      "The sandbox writes inside its workspace, where mkdir is its own."
  },
  "files.list": {
    elsewhere:
      "The sandbox has its own contained list_directory and glob."
  },
  "fonts.list": {
    gap:
      "Font discovery for the editor; no headless consumer yet."
  },
  "healthz": {
    elsewhere:
      "Liveness of a server the in-process capabilities do not use."
  },
  "integrations.confirmLink": {
    withheld:
      "Integration linking mints and redeems codes that grant a third " +
      "party access to this account. A run that could complete a link " +
      "could hand that access to whoever wrote the prompt."
  },
  "integrations.createLinkCode": {
    withheld:
      "Integration linking mints and redeems codes that grant a third " +
      "party access to this account. A run that could complete a link " +
      "could hand that access to whoever wrote the prompt."
  },
  "integrations.describeLinkCode": {
    withheld:
      "Integration linking mints and redeems codes that grant a third " +
      "party access to this account. A run that could complete a link " +
      "could hand that access to whoever wrote the prompt."
  },
  "integrations.list": {
    withheld:
      "Integration linking mints and redeems codes that grant a third " +
      "party access to this account. A run that could complete a link " +
      "could hand that access to whoever wrote the prompt."
  },
  "integrations.unlink": {
    withheld:
      "Integration linking mints and redeems codes that grant a third " +
      "party access to this account. A run that could complete a link " +
      "could hand that access to whoever wrote the prompt."
  },
  "jobs.cancel": { capability: "cancel_job" },
  "jobs.get": { capability: "get_job" },
  "jobs.list": { capability: "list_jobs" },
  "jobs.triggerStart": {
    withheld:
      "Arming a trigger schedules execution that outlives the run " +
      "that armed it. A prompt injection that can leave a recurring " +
      "job behind survives the conversation it arrived in."
  },
  "jobs.triggerStop": {
    withheld:
      "Arming a trigger schedules execution that outlives the run " +
      "that armed it. A prompt injection that can leave a recurring " +
      "job behind survives the conversation it arrived in."
  },
  "jobs.triggersRunning": {
    withheld:
      "The registration projection carries the webhook token and " +
      "secret, so reading it hands the guest a credential."
  },
  "jsScripts.create": { capability: "save_js_script" },
  "jsScripts.delete": { capability: "delete_js_script" },
  "jsScripts.documentVersions.create": { capability: "create_js_script_version" },
  "jsScripts.documentVersions.delete": { capability: "delete_js_script_version" },
  "jsScripts.documentVersions.get": { capability: "get_js_script_version" },
  "jsScripts.documentVersions.list": { capability: "list_js_script_versions" },
  "jsScripts.documentVersions.restore": { capability: "restore_js_script_version" },
  "jsScripts.get": { capability: "get_js_script" },
  "jsScripts.list": { capability: "list_js_scripts" },
  "jsScripts.palette": {
    elsewhere:
      "Editor palette metadata; list_js_scripts is the headless " +
      "discovery surface."
  },
  "jsScripts.update": { capability: "save_js_script" },
  "mcpConfig.install": {
    withheld:
      "Installing an MCP server registers code the host will execute " +
      "and credentials it will hold."
  },
  "mcpConfig.status": {
    withheld:
      "Installing an MCP server registers code the host will execute " +
      "and credentials it will hold."
  },
  "mcpConfig.uninstall": {
    withheld:
      "Installing an MCP server registers code the host will execute " +
      "and credentials it will hold."
  },
  "messages.list": {
    elsewhere:
      "get_thread returns a thread with its messages."
  },
  "models.all": { capability: "list_models" },
  "models.asr": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.asrByProvider": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.availableForKind": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.embeddingByProvider": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.huggingfaceByType": {
    withheld:
      "Model management writes to host disk and pulls gigabytes from " +
      "a third party. A run that could start or delete a download " +
      "could fill the disk or remove a model other runs depend on."
  },
  "models.huggingfaceCacheStatus": {
    withheld:
      "Model management writes to host disk and pulls gigabytes from " +
      "a third party. A run that could start or delete a download " +
      "could fill the disk or remove a model other runs depend on."
  },
  "models.huggingfaceDelete": {
    withheld:
      "Model management writes to host disk and pulls gigabytes from " +
      "a third party. A run that could start or delete a download " +
      "could fill the disk or remove a model other runs depend on."
  },
  "models.huggingfaceHubSearch": {
    elsewhere:
      "Searching a third-party hub is web_search and http_request, " +
      "which run behind the SSRF guard and the fetch cap."
  },
  "models.huggingfaceList": {
    withheld:
      "Model management writes to host disk and pulls gigabytes from " +
      "a third party. A run that could start or delete a download " +
      "could fill the disk or remove a model other runs depend on."
  },
  "models.huggingfaceSearch": {
    elsewhere:
      "Searching a third-party hub is web_search and http_request, " +
      "which run behind the SSRF guard and the fetch cap."
  },
  "models.imageByProvider": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.llmByProvider": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.mediaOptions": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.music": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.musicByProvider": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.ollama": {
    withheld:
      "Model management writes to host disk and pulls gigabytes from " +
      "a third party. A run that could start or delete a download " +
      "could fill the disk or remove a model other runs depend on."
  },
  "models.ollamaDelete": {
    withheld:
      "Model management writes to host disk and pulls gigabytes from " +
      "a third party. A run that could start or delete a download " +
      "could fill the disk or remove a model other runs depend on."
  },
  "models.providers": { capability: "list_provider_models" },
  "models.pullOllamaModel": {
    withheld:
      "Model management writes to host disk and pulls gigabytes from " +
      "a third party. A run that could start or delete a download " +
      "could fill the disk or remove a model other runs depend on."
  },
  "models.recommended": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.recommendedAsr": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.recommendedImageImageToImage": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.recommendedImageTextToImage": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.recommendedLanguageEmbedding": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.recommendedTts": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.recommendedVideoImageToVideo": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.recommendedVideoTextToVideo": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.transformersJsByType": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.transformersJsRecommended": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.tts": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.ttsByProvider": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.video": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "models.videoByProvider": {
    elsewhere:
      "find_model resolves a model by capability; list_models and " +
      "list_provider_models enumerate the catalogs."
  },
  "nodes.get": { capability: "get_node_info" },
  "nodes.list": { capability: "list_nodes" },
  "nodes.replicateStatus": {
    gap:
      "Whether a Replicate token is configured; list_secrets reports " +
      "the same thing by name."
  },
  "packs.getTrust": {
    withheld:
      "Pack installation and trust decide which third-party code the " +
      "host will run and which SKILL.md is read as instructions " +
      "rather than as untrusted text. A run that could grant itself " +
      "trust could escalate a prompt injection into executed code."
  },
  "packs.list": { capability: "list_sandbox_packages" },
  "packs.listBuiltins": {
    withheld:
      "Pack installation and trust decide which third-party code the " +
      "host will run and which SKILL.md is read as instructions " +
      "rather than as untrusted text. A run that could grant itself " +
      "trust could escalate a prompt injection into executed code."
  },
  "packs.reload": {
    withheld:
      "Pack installation and trust decide which third-party code the " +
      "host will run and which SKILL.md is read as instructions " +
      "rather than as untrusted text. A run that could grant itself " +
      "trust could escalate a prompt injection into executed code."
  },
  "packs.runtimeStatuses": {
    withheld:
      "Pack installation and trust decide which third-party code the " +
      "host will run and which SKILL.md is read as instructions " +
      "rather than as untrusted text. A run that could grant itself " +
      "trust could escalate a prompt injection into executed code."
  },
  "packs.sandboxModules": {
    elsewhere:
      "Compiled-module diagnostics; list_sandbox_packages reports " +
      "what a session can import."
  },
  "packs.sandboxPackageDocs": { capability: "get_sandbox_package_docs" },
  "packs.setBuiltinEnabled": {
    withheld:
      "Pack installation and trust decide which third-party code the " +
      "host will run and which SKILL.md is read as instructions " +
      "rather than as untrusted text. A run that could grant itself " +
      "trust could escalate a prompt injection into executed code."
  },
  "packs.setTrust": {
    withheld:
      "Pack installation and trust decide which third-party code the " +
      "host will run and which SKILL.md is read as instructions " +
      "rather than as untrusted text. A run that could grant itself " +
      "trust could escalate a prompt injection into executed code."
  },
  "projects.create": {
    gap:
      "A project groups documents that already carry its id, and a run " +
      "reaches every one of those documents by its own capability. What " +
      "is missing is the grouping itself — creating one, and reading the " +
      "status and spend rollup `projects.get` derives. Work, not a " +
      "boundary: nothing here is a credential, another tenant, or host " +
      "control."
  },
  "projects.delete": {
    gap:
      "Same grouping surface as `projects.create`. Deleting a project " +
      "leaves its documents in place, so this loses a name, not content."
  },
  "projects.documents": {
    gap:
      "Lists the documents in a project. A run enumerates each kind " +
      "through its own `list_*` capability today; what it cannot do is " +
      "ask which of them belong together."
  },
  "projects.get": {
    gap:
      "Same grouping surface as `projects.create`. Carries the derived " +
      "status and the spend rollup, both over rows the caller owns."
  },
  "projects.list": {
    gap: "Same grouping surface as `projects.create`."
  },
  "projects.update": {
    gap: "Same grouping surface as `projects.create`. Renames a project."
  },
  "resources.create": {
    elsewhere:
      "One envelope over assets, timelines, storyboards and image " +
      "documents. Every kind behind it already has its own " +
      "capability; the envelope exists so an app widget can bind " +
      "without knowing which kind it holds."
  },
  "resources.delete": {
    elsewhere:
      "One envelope over assets, timelines, storyboards and image " +
      "documents. Every kind behind it already has its own " +
      "capability; the envelope exists so an app widget can bind " +
      "without knowing which kind it holds."
  },
  "resources.list": {
    elsewhere:
      "One envelope over assets, timelines, storyboards and image " +
      "documents. Every kind behind it already has its own " +
      "capability; the envelope exists so an app widget can bind " +
      "without knowing which kind it holds."
  },
  "resources.read": {
    elsewhere:
      "One envelope over assets, timelines, storyboards and image " +
      "documents. Every kind behind it already has its own " +
      "capability; the envelope exists so an app widget can bind " +
      "without knowing which kind it holds."
  },
  "resources.update": {
    elsewhere:
      "One envelope over assets, timelines, storyboards and image " +
      "documents. Every kind behind it already has its own " +
      "capability; the envelope exists so an app widget can bind " +
      "without knowing which kind it holds."
  },
  "scripts.create": { capability: "create_script" },
  "scripts.delete": { capability: "delete_script" },
  "scripts.get": { capability: "get_script" },
  "scripts.list": { capability: "list_scripts" },
  "scripts.update": { capability: "edit_script" },
  "settings.list": { capability: "list_settings" },
  "settings.history.get": {
    withheld:
      "Database size, retention policy, and cleanup status are host " +
      "administration details. A workflow run does not need them."
  },
  "settings.history.update": {
    withheld:
      "Changing retention can erase history after the run ends. Host data " +
      "lifecycle policy stays under direct user control."
  },
  "settings.history.cleanup": {
    withheld:
      "Cleanup irreversibly deletes workflow and run history. A sandboxed " +
      "run must not remove the record of prior execution."
  },
  "settings.history.compact": {
    withheld:
      "SQLite compaction takes a host-wide write lock and rewrites the " +
      "database file. It is an explicit host maintenance operation."
  },
  "settings.secrets.delete": {
    withheld:
      "There is deliberately no way for sandboxed code to read or " +
      "write a credential value. request_secret asks the user for one " +
      "by name and never sees what they type; nodetool.secrets.get " +
      "reads only names the run declared."
  },
  "settings.secrets.get": {
    withheld:
      "There is deliberately no way for sandboxed code to read or " +
      "write a credential value. request_secret asks the user for one " +
      "by name and never sees what they type; nodetool.secrets.get " +
      "reads only names the run declared."
  },
  "settings.secrets.list": { capability: "list_secrets" },
  "settings.secrets.upsert": {
    withheld:
      "There is deliberately no way for sandboxed code to read or " +
      "write a credential value. request_secret asks the user for one " +
      "by name and never sees what they type; nodetool.secrets.get " +
      "reads only names the run declared."
  },
  "settings.secrets.validate": {
    withheld:
      "There is deliberately no way for sandboxed code to read or " +
      "write a credential value. request_secret asks the user for one " +
      "by name and never sees what they type; nodetool.secrets.get " +
      "reads only names the run declared."
  },
  "settings.update": { capability: "set_setting" },
  "skills.create": { capability: "create_skill" },
  "skills.delete": { capability: "delete_skill" },
  "skills.get": { capability: "load_skill" },
  "skills.list": { capability: "list_skills" },
  "skills.update": { capability: "update_skill" },
  "sketch.create": { capability: "create_sketch" },
  "sketch.delete": { capability: "delete_sketch" },
  "sketch.documentVersions.create": { capability: "create_sketch_version" },
  "sketch.documentVersions.delete": { capability: "delete_sketch_version" },
  "sketch.documentVersions.get": { capability: "get_sketch_version" },
  "sketch.documentVersions.list": { capability: "list_sketch_versions" },
  "sketch.documentVersions.restore": { capability: "restore_sketch_version" },
  "sketch.get": { capability: "get_sketch" },
  "sketch.layers.create": {
    elsewhere:
      "Per-layer generation takes and layer editing are the editor's " +
      "own surface; edit_sketch covers the document."
  },
  "sketch.layers.duplicate": {
    elsewhere:
      "Per-layer generation takes and layer editing are the editor's " +
      "own surface; edit_sketch covers the document."
  },
  "sketch.list": { capability: "list_sketches" },
  "sketch.update": { capability: "edit_sketch" },
  "sketch.versions.append": {
    elsewhere:
      "Per-layer generation takes and layer editing are the editor's " +
      "own surface; edit_sketch covers the document."
  },
  "sketch.versions.delete": {
    elsewhere:
      "Per-layer generation takes and layer editing are the editor's " +
      "own surface; edit_sketch covers the document."
  },
  "sketch.versions.list": {
    elsewhere:
      "Per-layer generation takes and layer editing are the editor's " +
      "own surface; edit_sketch covers the document."
  },
  "sketch.versions.setFavorite": {
    elsewhere:
      "Per-layer generation takes and layer editing are the editor's " +
      "own surface; edit_sketch covers the document."
  },
  "storage.signUrl": {
    withheld:
      "A signed URL grants whoever holds it direct object access, " +
      "outside every check in this table, for as long as it is valid. " +
      "read_asset returns the bytes to the run instead."
  },
  "storyboards.create": { capability: "create_storyboard" },
  "storyboards.delete": { capability: "delete_storyboard" },
  "storyboards.examples": {
    gap:
      "The shipped example boards, listed from disk. Workflow examples have " +
      "get_example_workflow; storyboards have no equivalent yet, so a run " +
      "that wants a directed board builds one with create_storyboard."
  },
  "storyboards.get": { capability: "get_storyboard" },
  "storyboards.installExample": {
    gap:
      "Installs a shipped board into the caller's own library — the same " +
      "row create_storyboard writes, from a file instead of an argument. " +
      "Worth a capability once something headless wants to start from one."
  },
  "storyboards.list": { capability: "list_storyboards" },
  "storyboards.update": { capability: "edit_storyboard" },
  "memories.delete": { capability: "memory_delete" },
  "memories.list": { capability: "memory_list" },
  "memories.search": { capability: "memory_search" },
  "threads.delete": {
    withheld:
      "Chat history is the record of what a run was asked to do and " +
      "what it did. A run that could rewrite or delete a conversation " +
      "could erase the evidence of its own behaviour, so the threads " +
      "module is read-only by design — see capabilities/threads.ts."
  },
  "threads.get": { capability: "get_thread" },
  "threads.list": { capability: "list_threads" },
  "threads.summarize": {
    withheld:
      "Chat history is the record of what a run was asked to do and " +
      "what it did. A run that could rewrite or delete a conversation " +
      "could erase the evidence of its own behaviour, so the threads " +
      "module is read-only by design — see capabilities/threads.ts."
  },
  "threads.update": {
    withheld:
      "Chat history is the record of what a run was asked to do and " +
      "what it did. A run that could rewrite or delete a conversation " +
      "could erase the evidence of its own behaviour, so the threads " +
      "module is read-only by design — see capabilities/threads.ts."
  },
  "timeline.clips.create": {
    elsewhere:
      "edit_timeline applies clip operations to the document."
  },
  "timeline.create": { capability: "assemble_script_timeline" },
  "timeline.delete": { capability: "delete_timeline" },
  "timeline.get": { capability: "get_timeline" },
  "timeline.list": { capability: "list_timelines" },
  "timeline.update": { capability: "edit_timeline" },
  "timeline.versions.create": { capability: "create_timeline_version" },
  "timeline.versions.delete": { capability: "delete_timeline_version" },
  "timeline.versions.get": { capability: "get_timeline_version" },
  "timeline.versions.list": { capability: "list_timeline_versions" },
  "timeline.versions.restore": { capability: "restore_timeline_version" },
  "triggers.fire": {
    elsewhere:
      "run_workflow and start_background_job start a run directly."
  },
  "triggers.listByWorkflow": {
    withheld:
      "The registration projection carries the webhook token and " +
      "secret, so reading it hands the guest a credential."
  },
  "users.create": {
    withheld:
      "Account administration reaches every tenant on the install, " +
      "not the caller's own rows."
  },
  "users.list": {
    withheld:
      "Account administration reaches every tenant on the install, " +
      "not the caller's own rows."
  },
  "users.remove": {
    withheld:
      "Account administration reaches every tenant on the install, " +
      "not the caller's own rows."
  },
  "users.resetToken": {
    withheld:
      "Account administration reaches every tenant on the install, " +
      "not the caller's own rows."
  },
  "worker.apiKeyStatus": {
    withheld:
      "Provisioning and terminating compute, and reading the API key " +
      "a worker authenticates with. Host control, not the caller's " +
      "data."
  },
  "worker.attach": {
    withheld:
      "Provisioning and terminating compute, and reading the API key " +
      "a worker authenticates with. Host control, not the caller's " +
      "data."
  },
  "worker.detach": {
    withheld:
      "Provisioning and terminating compute, and reading the API key " +
      "a worker authenticates with. Host control, not the caller's " +
      "data."
  },
  "worker.health": {
    withheld:
      "Provisioning and terminating compute, and reading the API key " +
      "a worker authenticates with. Host control, not the caller's " +
      "data."
  },
  "worker.instances.list": {
    withheld:
      "Provisioning and terminating compute, and reading the API key " +
      "a worker authenticates with. Host control, not the caller's " +
      "data."
  },
  "worker.profiles.create": {
    withheld:
      "Provisioning and terminating compute, and reading the API key " +
      "a worker authenticates with. Host control, not the caller's " +
      "data."
  },
  "worker.profiles.delete": {
    withheld:
      "Provisioning and terminating compute, and reading the API key " +
      "a worker authenticates with. Host control, not the caller's " +
      "data."
  },
  "worker.profiles.list": {
    withheld:
      "Provisioning and terminating compute, and reading the API key " +
      "a worker authenticates with. Host control, not the caller's " +
      "data."
  },
  "worker.provision": {
    withheld:
      "Provisioning and terminating compute, and reading the API key " +
      "a worker authenticates with. Host control, not the caller's " +
      "data."
  },
  "worker.reconcile": {
    withheld:
      "Provisioning and terminating compute, and reading the API key " +
      "a worker authenticates with. Host control, not the caller's " +
      "data."
  },
  "worker.resume": {
    withheld:
      "Provisioning and terminating compute, and reading the API key " +
      "a worker authenticates with. Host control, not the caller's " +
      "data."
  },
  "worker.stop": {
    withheld:
      "Provisioning and terminating compute, and reading the API key " +
      "a worker authenticates with. Host control, not the caller's " +
      "data."
  },
  "worker.stopAll": {
    withheld:
      "Provisioning and terminating compute, and reading the API key " +
      "a worker authenticates with. Host control, not the caller's " +
      "data."
  },
  "worker.terminate": {
    withheld:
      "Provisioning and terminating compute, and reading the API key " +
      "a worker authenticates with. Host control, not the caller's " +
      "data."
  },
  "workflows.autosave": {
    elsewhere:
      "update_workflow writes a graph; autosave is the editor's " +
      "debounced path."
  },
  "workflows.create": { capability: "create_workflow" },
  "workflows.delete": { capability: "delete_workflow" },
  "workflows.examples": { capability: "get_example_workflow" },
  "workflows.get": { capability: "get_workflow" },
  "workflows.list": { capability: "list_workflows" },
  "workflows.public.get": {
    elsewhere:
      "get_workflow resolves a public workflow by id."
  },
  "workflows.public.list": {
    elsewhere:
      "list_workflows and get_example_workflow cover discovery."
  },
  "workflows.sharing.accept": {
    withheld:
      "Sharing grants named people and link holders access to a " +
      "workflow. set_workflow_access is the one publishing decision " +
      "exposed, and it is classified `external` so the gate asks; " +
      "handing access to a *particular* account is a step further and " +
      "stays with the user."
  },
  "workflows.sharing.createLink": {
    withheld:
      "Sharing grants named people and link holders access to a " +
      "workflow. set_workflow_access is the one publishing decision " +
      "exposed, and it is classified `external` so the gate asks; " +
      "handing access to a *particular* account is a step further and " +
      "stays with the user."
  },
  "workflows.sharing.get": {
    withheld:
      "Sharing grants named people and link holders access to a " +
      "workflow. set_workflow_access is the one publishing decision " +
      "exposed, and it is classified `external` so the gate asks; " +
      "handing access to a *particular* account is a step further and " +
      "stays with the user."
  },
  "workflows.sharing.removeCollaborator": {
    withheld:
      "Sharing grants named people and link holders access to a " +
      "workflow. set_workflow_access is the one publishing decision " +
      "exposed, and it is classified `external` so the gate asks; " +
      "handing access to a *particular* account is a step further and " +
      "stays with the user."
  },
  "workflows.sharing.revokeLink": {
    withheld:
      "Sharing grants named people and link holders access to a " +
      "workflow. set_workflow_access is the one publishing decision " +
      "exposed, and it is classified `external` so the gate asks; " +
      "handing access to a *particular* account is a step further and " +
      "stays with the user."
  },
  "workflows.sharing.setRole": {
    withheld:
      "Sharing grants named people and link holders access to a " +
      "workflow. set_workflow_access is the one publishing decision " +
      "exposed, and it is classified `external` so the gate asks; " +
      "handing access to a *particular* account is a step further and " +
      "stays with the user."
  },
  "workflows.sharing.sharedWithMe": {
    withheld:
      "Sharing grants named people and link holders access to a " +
      "workflow. set_workflow_access is the one publishing decision " +
      "exposed, and it is classified `external` so the gate asks; " +
      "handing access to a *particular* account is a step further and " +
      "stays with the user."
  },
  "workflows.terminalOutputs": {
    elsewhere:
      "get_workflow carries the graph the outputs are read from."
  },
  "workflows.update": { capability: "update_workflow" },
  "workflows.versions.create": { capability: "create_workflow_version" },
  "workflows.versions.delete": { capability: "delete_workflow_version" },
  "workflows.versions.list": { capability: "list_workflow_versions" },
  "workflows.versions.restore": { capability: "restore_workflow_version" },
  "workspace.create": {
    withheld:
      "A workspace names an absolute path on the host filesystem, so " +
      "creating one and listing it is arbitrary host-path read. The " +
      "sandbox has its own workspace API, contained to the run's " +
      "directory, which is the point of it."
  },
  "workspace.delete": {
    withheld:
      "A workspace names an absolute path on the host filesystem, so " +
      "creating one and listing it is arbitrary host-path read. The " +
      "sandbox has its own workspace API, contained to the run's " +
      "directory, which is the point of it."
  },
  "workspace.list": {
    withheld:
      "A workspace names an absolute path on the host filesystem, so " +
      "creating one and listing it is arbitrary host-path read. The " +
      "sandbox has its own workspace API, contained to the run's " +
      "directory, which is the point of it."
  },
  "workspace.listFiles": {
    withheld:
      "A workspace names an absolute path on the host filesystem, so " +
      "creating one and listing it is arbitrary host-path read. The " +
      "sandbox has its own workspace API, contained to the run's " +
      "directory, which is the point of it."
  },
  "workspace.readFile": {
    withheld:
      "A workspace names an absolute path on the host filesystem, so " +
      "reading a file out of one is host-path read. The sandbox has its " +
      "own workspace API, contained to the run's directory, which is the " +
      "point of it."
  },
  "workspace.writeFile": {
    withheld:
      "A workspace names an absolute path on the host filesystem, so " +
      "writing a file into one is host-path write. The sandbox has its " +
      "own workspace API, contained to the run's directory, which is the " +
      "point of it."
  },
  "workspace.update": {
    withheld:
      "A workspace names an absolute path on the host filesystem, so " +
      "creating one and listing it is arbitrary host-path read. The " +
      "sandbox has its own workspace API, contained to the run's " +
      "directory, which is the point of it."
  },};
