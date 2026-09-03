/**
 * The personal-data registry — one row per database table, and what happens to
 * it when a person exercises Art. 17 (erasure) or Art. 20 (portability).
 *
 * This file is the policy document. Someone answering a regulator should be
 * able to read it top to bottom and explain the whole disposition of the
 * database without opening another file: which tables hold personal data, how
 * the person is reached in each, what is deleted, what is kept and under which
 * lawful basis, and what is deliberately withheld from an export.
 *
 * It is a registry rather than a hand-written delete list for the reason
 * hand-written delete lists always rot: nobody remembers to add the table.
 * Three things keep it honest, and all three live in
 * `tests/personal-data-audit.test.ts`:
 *
 * 1. Every table exported from `src/schema/index.ts` must appear here exactly
 *    once. A new table with no entry fails the audit with its name.
 * 2. A table that has a `user_id` column must be reached directly by it and
 *    must not be classified `not-personal`. Adding a user-keyed table and
 *    filing it as infrastructure fails.
 * 3. Every actionable entry must be wired into `ERASURE_HANDLERS` and, when
 *    `exported` is true, into `EXPORT_HANDLERS` in `personal-data.ts`. An
 *    entry added here and never implemented fails.
 *
 * The audit asserts it *found* tables before it asserts anything about them,
 * so a broken schema walk cannot pass by matching nothing.
 *
 * Modelled on `PACKAGE_RUNTIME_ASSETS` (`@nodetool-ai/config`) and the URL
 * egress inventory (`packages/runtime/tests/url-egress-inventory.ts`), which
 * are the two registries in this repo that already work this way.
 */

/**
 * What erasure does to a table. Erasure is not uniformly "delete the row" —
 * a billing record has to survive its statutory accounting period, and the
 * consent log is our own proof that consent was given.
 */
export type PersonalDataDisposition =
  /** Remove the rows. The default for content a person authored or generated. */
  | "delete"
  /** Keep the row, null the columns that carry personal content. */
  | "redact"
  /** Keep the row intact under a lawful basis that outlives the request. */
  | "retain"
  /** Keep the row, replace the identifiers so it no longer names a person. */
  | "anonymize"
  /** No personal data. Nothing to erase, nothing to export. */
  | "not-personal";

/**
 * How the person is reached from the table.
 *
 * `direct` names the column carrying the user id — usually `user_id`, but
 * `nodetool_workflow_shares` calls it `created_by`. `indirect` means the row
 * is only reachable through a join, which is exactly the case a naive
 * `WHERE user_id = ?` sweep silently misses.
 */
export type PersonalDataReach =
  | { readonly kind: "direct"; readonly column: string }
  | {
      readonly kind: "indirect";
      /** The column joined on, e.g. "run_id". */
      readonly column: string;
      /** The user-keyed table it resolves against, e.g. "nodetool_jobs". */
      readonly parent: string;
    }
  | { readonly kind: "none" };

export interface PersonalDataEntry {
  /** Physical table name, as `getTableName()` reports it. */
  readonly table: string;
  /** The `src/schema/index.ts` export the audit resolves the table through. */
  readonly schemaExport: string;
  readonly disposition: PersonalDataDisposition;
  readonly reach: PersonalDataReach;
  /**
   * Columns nulled by a `redact`. Required for that disposition, rejected for
   * every other one, and each name is checked against the live schema.
   */
  readonly redactedColumns?: readonly string[];
  /**
   * Columns replaced by a placeholder in an Art. 20 export. Credential
   * material: a ciphertext, a hash, a bearer token. The column is still
   * *listed*, so the person can see the record exists — its value never
   * leaves the process.
   */
  readonly withheldColumns?: readonly string[];
  /** False when the table contributes nothing to an Art. 20 export. */
  readonly exported: boolean;
  /** Why this disposition, in a sentence a non-engineer can check. */
  readonly justification: string;
}

/**
 * The placeholder an export writes in place of a withheld column's value.
 * Distinct from `null`, which would misrepresent an absent value as stored.
 */
export const WITHHELD_VALUE = "[withheld: credential material]";

export const PERSONAL_DATA_REGISTRY: readonly PersonalDataEntry[] = [
  // ── Identity, credentials and consent ──────────────────────────────

  {
    table: "access_tokens",
    schemaExport: "accessTokens",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    withheldColumns: ["secret_hash"],
    exported: true,
    justification:
      "API tokens the person minted. Deleted so no credential outlives the account. The hash is a credential verifier, not information about the person, so the export lists the token and withholds the hash."
  },
  {
    table: "external_identities",
    schemaExport: "externalIdentities",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "The link between this account and a Google/GitHub identity. It identifies the person at a third party, so it goes; the export tells them which providers were linked."
  },
  {
    table: "nodetool_oauth_credentials",
    schemaExport: "oauthCredentials",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    withheldColumns: ["encrypted_access_token", "encrypted_refresh_token"],
    exported: true,
    justification:
      "Access to the person's third-party accounts. Deleted outright. The export names the provider, account and scope so they can revoke on the other side, but never the tokens — decrypting them into a downloadable file would create a fresh copy of a live credential."
  },
  {
    table: "nodetool_secrets",
    schemaExport: "secrets",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    withheldColumns: ["encrypted_value"],
    exported: true,
    justification:
      "Provider API keys, encrypted at rest under the master key (see `Secret.getDecryptedValue`). The export lists which keys existed by name and description — that is the portable fact — and withholds the ciphertext."
  },
  {
    table: "mcp_oauth_grants",
    schemaExport: "mcpOauthGrants",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "One row per MCP client the person consented to. Deleted with the account; exported because the consent record is theirs and shows what each client was allowed to reach."
  },
  {
    table: "mcp_oauth_tokens",
    schemaExport: "mcpOauthTokens",
    disposition: "delete",
    reach: { kind: "indirect", column: "grant_id", parent: "mcp_oauth_grants" },
    exported: false,
    justification:
      "Access and refresh tokens hanging off a grant. No user_id of its own — a sweep keyed on user_id leaves live tokens behind after the grant is gone, so it is deleted by grant id first. Not exported: every column is a hash, an expiry or a rotation pointer, which tells the person nothing and hands an attacker the shape of the credential chain."
  },
  {
    table: "mcp_oauth_clients",
    schemaExport: "mcpOauthClients",
    disposition: "not-personal",
    reach: { kind: "none" },
    exported: false,
    justification:
      "A dynamically registered OAuth client (RFC 7591): name plus redirect URIs, with no owner column. The registration is shared — several people can consent to the same client — so deleting it on one person's request would break other people's grants. Their personal half is `mcp_oauth_grants`, which is deleted."
  },
  {
    table: "nodetool_user_events",
    schemaExport: "userEvents",
    disposition: "retain",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "The privacy audit log. Erasure deletes the operational half (sign-ins, token issuance, delete/share audit rows) and keeps the types in `NEVER_PRUNED_USER_EVENT_TYPES` — consent, terms and the data-subject-request rows — for the same reason `pruneUserEvents` refuses to age them out: Art. 7(1) requires being able to demonstrate consent was given, and the DSR rows are our own evidence that the request was received and answered. Deleting them would destroy the proof that this erasure happened. `purgeComplianceEvidence` overrides it for a closed account with legal sign-off."
  },

  // ── Billing and accounting ─────────────────────────────────────────

  {
    table: "nodetool_predictions",
    schemaExport: "predictions",
    disposition: "redact",
    reach: { kind: "direct", column: "user_id" },
    redactedColumns: ["parameters", "metadata", "logs"],
    exported: true,
    justification:
      "The billing ledger for model calls: cost, tokens, provider, model, unit price. Those columns are accounting records kept under Art. 17(3)(b) for the statutory retention period, so the row survives. `parameters`, `metadata` and `logs` carry prompt text and provider payloads and have no accounting purpose, so they are nulled. This is the same redaction the retention sweep performs; erasure reuses `cleanupStorage` rather than re-deriving it."
  },
  {
    table: "nodetool_credit_ledger",
    schemaExport: "creditLedger",
    disposition: "retain",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Double-entry balance movements. An accounting record under Art. 17(3)(b); removing entries would leave the balance unreconcilable. Every column is an amount, a kind, a period key or a timestamp — there is no free text to redact, so the row is kept whole."
  },
  {
    table: "nodetool_user_subscriptions",
    schemaExport: "userSubscriptions",
    disposition: "retain",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Which plan the account was on and its status. Contract and accounting evidence, retained on the same basis as the ledger it explains. Plan id and status are not content."
  },

  // ── Workflows and the graph editor ─────────────────────────────────

  {
    table: "nodetool_workflows",
    schemaExport: "workflows",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "The person's authored graphs. Their content, deleted on request and exported in full."
  },
  {
    table: "nodetool_workflow_versions",
    schemaExport: "workflowVersions",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Version history of those graphs. Same content, older revisions — the copy the retention sweep prunes on a timer is deleted outright here."
  },
  {
    table: "nodetool_workflow_collaborators",
    schemaExport: "workflowCollaborators",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Membership rows, in both directions. Erasure removes the rows where this person is the collaborator, and also the rows on this person's own workflows — those name *other* people and must not be left pointing at a deleted graph. The export is deliberately narrower: only rows whose user_id is the subject, because the other rows are other people's memberships and are not this person's to receive."
  },
  {
    table: "nodetool_workflow_shares",
    schemaExport: "workflowShares",
    disposition: "delete",
    reach: { kind: "direct", column: "created_by" },
    withheldColumns: ["token"],
    exported: true,
    justification:
      "Public share links. No `user_id` column — the owner is `created_by`, which a user_id sweep misses, leaving live share tokens for deleted workflows. Erasure deletes both by `created_by` and by the workflow ids being deleted. `token` is a live bearer credential and is withheld from the export."
  },

  // ── Runs, jobs and their exhaust ───────────────────────────────────

  {
    table: "nodetool_jobs",
    schemaExport: "jobs",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Run records: the graph as executed, its parameters, logs and errors. The person's own activity, deleted and exported."
  },
  {
    table: "run_events",
    schemaExport: "runEvents",
    disposition: "delete",
    reach: { kind: "indirect", column: "run_id", parent: "nodetool_jobs" },
    exported: true,
    justification:
      "Per-node event payloads — the inputs a person typed and the outputs a model produced, at full fidelity. The heaviest personal-data surface in the database and it has no user_id: it is reached by `run_id` against `nodetool_jobs`. Deleted before the jobs it hangs off, or the join that finds it is gone."
  },
  {
    table: "run_inbox_messages",
    schemaExport: "runInboxMessages",
    disposition: "delete",
    reach: { kind: "indirect", column: "run_id", parent: "nodetool_jobs" },
    exported: false,
    justification:
      "The queue a running graph pulls messages from; `payload_json` can hold user content. Deleted by run id for the same reason as `run_events`. Not exported: it is transport state with claim leases and worker ids, and the content it carried is already in `run_events` in its delivered form."
  },
  {
    table: "trigger_inputs",
    schemaExport: "triggerInputs",
    disposition: "delete",
    reach: { kind: "indirect", column: "run_id", parent: "nodetool_jobs" },
    exported: true,
    justification:
      "The payload that started a run — an inbound webhook body, a polled item. Personal data supplied by or about the person, reached by `run_id`. Exported because it is data they provided."
  },
  {
    table: "trigger_registrations",
    schemaExport: "triggerRegistrations",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Standing triggers the person configured. Deleted, or a deleted account keeps firing runs. Exported so they can rebuild them elsewhere."
  },

  // ── Assets, chat and documents ─────────────────────────────────────

  {
    table: "nodetool_assets",
    schemaExport: "assets",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Rows describing stored files. The bytes are a second surface: objects live under the `<user_id>/` key prefix and are removed through the injected `ErasureObjectStore`, because deleting the row without the blob leaves the media readable by anyone holding a URL. The export carries the metadata; the bytes are delivered as files, not inlined."
  },
  {
    table: "nodetool_threads",
    schemaExport: "threads",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Chat threads the person started. Deleted with the messages inside them; a thread row left behind names a conversation that no longer exists."
  },
  {
    table: "nodetool_messages",
    schemaExport: "messages",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Chat messages, including everything they typed and every model reply. Their content in the most direct sense."
  },
  {
    table: "nodetool_memories",
    schemaExport: "memories",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Facts the agent retained about the person across sessions. Exactly the profile Art. 17 exists for."
  },
  {
    table: "nodetool_settings",
    schemaExport: "appSettings",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Per-user preferences. Not sensitive, but keyed to the person and with no reason to outlive them."
  },
  {
    table: "nodetool_workspaces",
    schemaExport: "workspaces",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Named workspace roots. The row is a pointer; the files under it are removed with the rest of the person's objects."
  },
  {
    table: "projects",
    schemaExport: "projects",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "The person's project folders — the container the documents, scripts and storyboards below hang off. Deleted after them, so nothing is orphaned."
  },
  {
    table: "skills",
    schemaExport: "skills",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification: "Skill documents the person wrote, content and all."
  },
  {
    table: "scripts",
    schemaExport: "scripts",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification: "Screenplay documents the person authored."
  },
  {
    table: "storyboards",
    schemaExport: "storyboards",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification: "Storyboard documents the person authored."
  },
  {
    table: "js_scripts",
    schemaExport: "jsScripts",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "JavaScript documents the person wrote. Authored content, deleted on request and exported in full."
  },
  {
    table: "js_script_versions",
    schemaExport: "jsScriptVersions",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Revision history of those JavaScript documents. Same content, older revisions, deleted with the document rather than left behind by the cascade."
  },
  {
    table: "image_documents",
    schemaExport: "imageDocuments",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification: "Sketch/image editor documents the person authored."
  },
  {
    table: "image_document_versions",
    schemaExport: "imageDocumentVersions",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Revision history of those image documents. Deleted explicitly rather than through the declared cascade, which SQLite only enforces when `PRAGMA foreign_keys` is on for that connection."
  },
  {
    table: "timeline_sequences",
    schemaExport: "timelineSequences",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Video timelines the person edited, including the full timeline document. Authored content."
  },
  {
    table: "timeline_sequence_versions",
    schemaExport: "timelineSequenceVersions",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Revision history of those timelines. Deleted explicitly for the same reason as the other version tables: the cascade is not guaranteed on a SQLite connection."
  },

  // ── Published applications ─────────────────────────────────────────

  {
    table: "applications",
    schemaExport: "applications",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Mini-apps the person built. Deleted last among the application tables, so a failure part-way leaves the app whole rather than half-erased — the ordering `Application.delete` already uses, because the child rows carry no owner of their own and a leftover child is readable by whoever next claims the id."
  },
  {
    table: "application_versions",
    schemaExport: "applicationVersions",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Released versions, each holding the app document and its workflow graphs. Deleted explicitly rather than relying on the declared cascade: `PRAGMA foreign_keys` is per-connection and a connection opened without it silently keeps the children."
  },
  {
    table: "application_deployments",
    schemaExport: "applicationDeployments",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    withheldColumns: ["token"],
    exported: true,
    justification:
      "Deployment records for a published app. The `token` is a live bearer credential for invoking it, so it is withheld from the export and the row is deleted."
  },
  {
    table: "application_invocations",
    schemaExport: "applicationInvocations",
    disposition: "delete",
    reach: { kind: "direct", column: "user_id" },
    exported: true,
    justification:
      "Per-run spend telemetry for the person's own app: estimate, actual, status. Deleted with the app rather than retained, because the money side is already recorded in `nodetool_credit_ledger` and `nodetool_predictions`, which do survive — keeping a third copy would retain more than the accounting basis needs."
  },
  {
    table: "application_budgets",
    schemaExport: "applicationBudgets",
    disposition: "delete",
    reach: {
      kind: "indirect",
      column: "application_id",
      parent: "applications"
    },
    exported: true,
    justification:
      "The spend ceiling for one app. Keyed only by `application_id`, so a user_id sweep misses it and leaves an orphan budget row; erasure resolves it through the person's applications."
  },

  // ── Infrastructure: no personal data ───────────────────────────────

  {
    table: "worker_profiles",
    schemaExport: "workerProfiles",
    disposition: "not-personal",
    reach: { kind: "none" },
    exported: false,
    justification:
      "A reusable preset for provisioning a GPU worker: image, hardware spec, timeouts. Operator configuration shared by the whole install, with no column naming a person."
  },
  {
    table: "worker_instances",
    schemaExport: "workerInstances",
    disposition: "not-personal",
    reach: { kind: "none" },
    exported: false,
    justification:
      "A live handle to a provisioned pod: provider reference, websocket URL, encrypted pod token, status. `attached_to` names the device a pod is bound to, not an account. Instances are ephemeral and torn down by the compute reaper; erasing one on a person's request would kill a running pod that may not be theirs."
  },
  {
    table: "nodetool_team_tasks",
    schemaExport: "teamTasks",
    disposition: "not-personal",
    reach: { kind: "none" },
    exported: false,
    justification:
      "The agent team task board. `created_by` and `claimed_by` name an agent within a team, not an authenticated account, and there is no user_id or team-to-user mapping to reach a person by. No code in this repo writes the table today — the only references are the schema, the migration and the DDL. Revisit the classification in the same change that adds a writer: if tasks become user-attributable, this becomes a `delete` entry."
  }
];

/** Registry entries indexed by physical table name. */
export const PERSONAL_DATA_BY_TABLE: ReadonlyMap<string, PersonalDataEntry> =
  new Map(PERSONAL_DATA_REGISTRY.map((entry) => [entry.table, entry]));

/** Dispositions that require erasure to do something to the table. */
const ACTIONABLE: readonly PersonalDataDisposition[] = [
  "delete",
  "redact",
  "retain",
  "anonymize"
];

/** True when erasure must handle this table rather than skip it. */
export function isActionable(entry: PersonalDataEntry): boolean {
  return ACTIONABLE.includes(entry.disposition);
}
