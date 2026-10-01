/** Frozen SQLite baseline for migration 20261001_000000. Future schema changes belong in versions.ts. */
import Database from "better-sqlite3";

export const SQLITE_BASELINE_VERSION = "20261001_000000";

export function getCreateSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS "nodetool_workflows" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "name" text NOT NULL DEFAULT '',
      "tool_name" text,
      "description" text DEFAULT '',
      "tags" text,
      "thumbnail" text,
      "thumbnail_url" text,
      "graph" text NOT NULL,
      "settings" text,
      "package_name" text,
      "path" text,
      "run_mode" text,
      "workspace_id" text,
      "project_id" text NOT NULL DEFAULT 'default',
      "html_app" text,
      "app_doc" text,
      "receive_clipboard" integer,
      "access" text NOT NULL DEFAULT 'private',
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_workflows_user_id" ON "nodetool_workflows" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_workflows_access" ON "nodetool_workflows" ("access");
    CREATE INDEX IF NOT EXISTS "idx_workflows_user_project" ON "nodetool_workflows" ("user_id", "project_id");

    CREATE TABLE IF NOT EXISTS "nodetool_jobs" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "job_type" text NOT NULL DEFAULT '',
      "workflow_id" text NOT NULL,
      "project_id" text NOT NULL DEFAULT 'default',
      "status" text NOT NULL DEFAULT 'scheduled',
      "name" text DEFAULT '',
      "graph" text,
      "params" text,
      "worker_id" text,
      "heartbeat_at" text,
      "started_at" text,
      "finished_at" text,
      "completed_at" text,
      "failed_at" text,
      "error" text,
      "error_message" text,
      "cost" real,
      "logs" text,
      "retry_count" integer NOT NULL DEFAULT 0,
      "max_retries" integer NOT NULL DEFAULT 3,
      "version" integer NOT NULL DEFAULT 0,
      "execution_strategy" text,
      "execution_id" text,
      "runner_instance" text,
      "metadata_json" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_jobs_status" ON "nodetool_jobs" ("status");
    CREATE INDEX IF NOT EXISTS "idx_jobs_updated_at" ON "nodetool_jobs" ("updated_at");
    CREATE INDEX IF NOT EXISTS "idx_jobs_worker_id" ON "nodetool_jobs" ("worker_id");
    CREATE INDEX IF NOT EXISTS "idx_jobs_heartbeat_at" ON "nodetool_jobs" ("heartbeat_at");
    CREATE INDEX IF NOT EXISTS "idx_jobs_recovery" ON "nodetool_jobs" ("status", "heartbeat_at");
    CREATE INDEX IF NOT EXISTS "idx_jobs_user_project" ON "nodetool_jobs" ("user_id", "project_id");

    CREATE TABLE IF NOT EXISTS "nodetool_messages" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "thread_id" text NOT NULL,
      "role" text NOT NULL DEFAULT 'user',
      "name" text,
      "content" text,
      "tool_calls" text,
      "tool_call_id" text,
      "input_files" text,
      "output_files" text,
      "provider" text,
      "model" text,
      "cost" real,
      "workflow_id" text,
      "graph" text,
      "tools" text,
      "collections" text,
      "agent_mode" integer,
      "help_mode" integer,
      "agent_execution_id" text,
      "execution_event_type" text,
      "workflow_target" text,
      "media_generation" text,
      "provider_session" text,
      "created_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_messages_thread_id" ON "nodetool_messages" ("thread_id");

    CREATE TABLE IF NOT EXISTS "nodetool_threads" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "workflow_id" text,
      "project_id" text NOT NULL DEFAULT 'default',
      "title" text NOT NULL DEFAULT '',
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_threads_user_id" ON "nodetool_threads" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_threads_user_workflow" ON "nodetool_threads" ("user_id", "workflow_id");
    CREATE INDEX IF NOT EXISTS "idx_threads_user_project" ON "nodetool_threads" ("user_id", "project_id");

    CREATE TABLE IF NOT EXISTS "nodetool_assets" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "parent_id" text,
      "file_id" text,
      "name" text NOT NULL DEFAULT '',
      "content_type" text NOT NULL DEFAULT 'application/octet-stream',
      "size" real,
      "duration" real,
      "metadata" text,
      "sketch_document_id" text,
      "workflow_id" text,
      "node_id" text,
      "job_id" text,
      "timeline_id" text,
      "project_id" text NOT NULL DEFAULT 'default',
      "external_path" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_assets_user_parent" ON "nodetool_assets" ("user_id", "parent_id");
    CREATE INDEX IF NOT EXISTS "idx_assets_user_project" ON "nodetool_assets" ("user_id", "project_id");

    CREATE TABLE IF NOT EXISTS "nodetool_secrets" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "key" text NOT NULL,
      "encrypted_value" text NOT NULL,
      "description" text DEFAULT '',
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_secrets_user_key" ON "nodetool_secrets" ("user_id", "key");
    CREATE INDEX IF NOT EXISTS "idx_secrets_user_id" ON "nodetool_secrets" ("user_id");

    CREATE TABLE IF NOT EXISTS "nodetool_workspaces" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "name" text NOT NULL DEFAULT '',
      "path" text NOT NULL DEFAULT '',
      "project_id" text NOT NULL DEFAULT 'default',
      "is_default" integer DEFAULT 0,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_workspaces_user_id" ON "nodetool_workspaces" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_workspaces_user_project" ON "nodetool_workspaces" ("user_id", "project_id");

    CREATE TABLE IF NOT EXISTS "nodetool_workflow_versions" (
      "id" text PRIMARY KEY NOT NULL,
      "workflow_id" text NOT NULL,
      "user_id" text NOT NULL,
      "name" text,
      "description" text,
      "graph" text NOT NULL,
      "version" integer NOT NULL DEFAULT 1,
      "save_type" text NOT NULL DEFAULT 'manual',
      "autosave_metadata" text,
      "created_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_wv_workflow_id" ON "nodetool_workflow_versions" ("workflow_id");
    CREATE INDEX IF NOT EXISTS "idx_wv_user_id" ON "nodetool_workflow_versions" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_nodetool_workflow_versions_workflow_id_save_type_created_at" ON "nodetool_workflow_versions" ("workflow_id", "save_type", "created_at");

    CREATE TABLE IF NOT EXISTS "nodetool_oauth_credentials" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "provider" text NOT NULL,
      "account_id" text NOT NULL,
      "encrypted_access_token" text NOT NULL,
      "encrypted_refresh_token" text,
      "username" text,
      "token_type" text NOT NULL DEFAULT 'Bearer',
      "scope" text,
      "received_at" text NOT NULL,
      "expires_at" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_oauth_user_id" ON "nodetool_oauth_credentials" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_oauth_user_provider" ON "nodetool_oauth_credentials" ("user_id", "provider");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_oauth_user_provider_account" ON "nodetool_oauth_credentials" ("user_id", "provider", "account_id");

    CREATE TABLE IF NOT EXISTS "nodetool_predictions" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "node_id" text NOT NULL DEFAULT '',
      "node_type" text NOT NULL DEFAULT '',
      "provider" text NOT NULL DEFAULT '',
      "model" text NOT NULL DEFAULT '',
      "workflow_id" text,
      "project_id" text,
      "document_id" text,
      "error" text,
      "logs" text,
      "status" text NOT NULL DEFAULT 'pending',
      "cost" real,
      "input_tokens" integer,
      "output_tokens" integer,
      "total_tokens" integer,
      "cached_tokens" integer,
      "reasoning_tokens" integer,
      "billing_unit" text,
      "quantity" real,
      "unit_price" real,
      "currency" text,
      "provider_request_id" text,
      "capability" text,
      "surface" text,
      "thread_id" text,
      "tool_call_id" text,
      "request_id" text,
      "idempotency_key" text,
      "input_fingerprint" text,
      "lifecycle_owner" text NOT NULL DEFAULT 'legacy',
      "submission_status" text NOT NULL DEFAULT 'accepted',
      "provider_status" text NOT NULL DEFAULT 'unknown',
      "output_status" text NOT NULL DEFAULT 'pending',
      "attachment_status" text NOT NULL DEFAULT 'pending',
      "accepted_at" text,
      "lease_owner" text,
      "lease_expires_at" text,
      "lease_version" integer NOT NULL DEFAULT 0,
      "next_check_at" text,
      "attempt_count" integer NOT NULL DEFAULT 0,
      "cancel_requested_at" text,
      "job_id" text,
      "asset_ids" text,
      "reconciled_at" text,
      "reconcile_attempts" integer NOT NULL DEFAULT 0,
      "created_at" text,
      "started_at" text,
      "completed_at" text,
      "duration" real,
      "hardware" text,
      "input_size" integer,
      "output_size" integer,
      "parameters" text,
      "metadata" text
    );
    CREATE INDEX IF NOT EXISTS "idx_prediction_user_status" ON "nodetool_predictions" ("user_id", "status");
    CREATE INDEX IF NOT EXISTS "idx_prediction_user_thread" ON "nodetool_predictions" ("user_id", "thread_id");
    CREATE INDEX IF NOT EXISTS "idx_prediction_job" ON "nodetool_predictions" ("job_id");
    CREATE INDEX IF NOT EXISTS "idx_prediction_user_request" ON "nodetool_predictions" ("user_id", "request_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_prediction_user_idempotency" ON "nodetool_predictions" ("user_id", "idempotency_key");
    CREATE INDEX IF NOT EXISTS "idx_prediction_durable_due" ON "nodetool_predictions" ("lifecycle_owner", "next_check_at");
    CREATE INDEX IF NOT EXISTS "idx_prediction_lease" ON "nodetool_predictions" ("lease_expires_at");
    CREATE INDEX IF NOT EXISTS "idx_predictions_user_id" ON "nodetool_predictions" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_predictions_user_provider" ON "nodetool_predictions" ("user_id", "provider");
    CREATE INDEX IF NOT EXISTS "idx_prediction_created_at" ON "nodetool_predictions" ("created_at");
    CREATE INDEX IF NOT EXISTS "idx_prediction_user_model" ON "nodetool_predictions" ("user_id", "model");
    CREATE INDEX IF NOT EXISTS "idx_prediction_user_project" ON "nodetool_predictions" ("user_id", "project_id");

    CREATE TABLE IF NOT EXISTS "nodetool_generation_attempts" (
      "id" text PRIMARY KEY NOT NULL,
      "generation_id" text NOT NULL REFERENCES "nodetool_predictions" ("id") ON DELETE CASCADE,
      "attempt_number" integer NOT NULL DEFAULT 1,
      "provider" text NOT NULL,
      "provider_account_ref" text,
      "provider_request_id" text,
      "gateway_request_id" text,
      "provider_execution_id" text,
      "endpoint" text,
      "callback_token_hash" text,
      "callback_token_ciphertext" text,
      "decoder_version" text,
      "input_fingerprint" text,
      "submission_idempotency_key" text,
      "submission_status" text NOT NULL DEFAULT 'accepted',
      "provider_status" text NOT NULL DEFAULT 'unknown',
      "request_payload" text,
      "raw_result_ref" text,
      "lease_owner" text,
      "lease_expires_at" text,
      "lease_version" integer NOT NULL DEFAULT 0,
      "next_check_at" text,
      "check_attempts" integer NOT NULL DEFAULT 0,
      "last_error" text,
      "cancel_requested_at" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_generation_attempt_generation_number" ON "nodetool_generation_attempts" ("generation_id", "attempt_number");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_generation_attempt_provider_request" ON "nodetool_generation_attempts" ("provider", "provider_account_ref", "provider_request_id");
    CREATE INDEX IF NOT EXISTS "idx_generation_attempt_due" ON "nodetool_generation_attempts" ("submission_status", "next_check_at");
    CREATE INDEX IF NOT EXISTS "idx_generation_attempt_lease" ON "nodetool_generation_attempts" ("lease_expires_at");
    CREATE INDEX IF NOT EXISTS "idx_generation_attempt_callback_token" ON "nodetool_generation_attempts" ("callback_token_hash");

    CREATE TABLE IF NOT EXISTS "nodetool_generation_webhook_deliveries" (
      "id" text PRIMARY KEY NOT NULL,
      "provider" text NOT NULL,
      "provider_account_ref" text NOT NULL,
      "provider_request_id" text NOT NULL,
      "payload_hash" text NOT NULL,
      "generation_id" text REFERENCES "nodetool_predictions" ("id") ON DELETE SET NULL,
      "attempt_id" text REFERENCES "nodetool_generation_attempts" ("id") ON DELETE SET NULL,
      "raw_payload" text NOT NULL,
      "signature" text,
      "observation" text,
      "status" text NOT NULL DEFAULT 'pending',
      "lease_owner" text,
      "lease_expires_at" text,
      "lease_version" integer NOT NULL DEFAULT 0,
      "received_at" text NOT NULL,
      "processed_at" text,
      "error" text
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_generation_webhook_identity" ON "nodetool_generation_webhook_deliveries" ("provider", "provider_account_ref", "provider_request_id", "payload_hash");
    CREATE INDEX IF NOT EXISTS "idx_generation_webhook_pending" ON "nodetool_generation_webhook_deliveries" ("status", "received_at");
    CREATE INDEX IF NOT EXISTS "idx_generation_webhook_generation" ON "nodetool_generation_webhook_deliveries" ("generation_id");

    CREATE TABLE IF NOT EXISTS "nodetool_generation_outputs" (
      "id" text PRIMARY KEY NOT NULL,
      "generation_id" text NOT NULL REFERENCES "nodetool_predictions" ("id") ON DELETE CASCADE,
      "attempt_id" text NOT NULL REFERENCES "nodetool_generation_attempts" ("id") ON DELETE CASCADE,
      "output_key" text NOT NULL,
      "output_index" integer NOT NULL DEFAULT 0,
      "output_type" text NOT NULL DEFAULT 'media',
      "provider_ref" text,
      "raw_result" text,
      "storage_key" text,
      "asset_id" text,
      "status" text NOT NULL DEFAULT 'pending',
      "error" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_generation_output_identity" ON "nodetool_generation_outputs" ("generation_id", "attempt_id", "output_key", "output_index");
    CREATE INDEX IF NOT EXISTS "idx_generation_output_generation" ON "nodetool_generation_outputs" ("generation_id");
    CREATE INDEX IF NOT EXISTS "idx_generation_output_status" ON "nodetool_generation_outputs" ("status");

    CREATE TABLE IF NOT EXISTS "nodetool_generation_attachments" (
      "id" text PRIMARY KEY NOT NULL,
      "generation_id" text NOT NULL REFERENCES "nodetool_predictions" ("id") ON DELETE CASCADE,
      "output_id" text NOT NULL REFERENCES "nodetool_generation_outputs" ("id") ON DELETE CASCADE,
      "target_type" text NOT NULL,
      "target_id" text NOT NULL,
      "status" text NOT NULL DEFAULT 'pending',
      "selected" integer NOT NULL DEFAULT 0,
      "error" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_generation_attachment_identity" ON "nodetool_generation_attachments" ("generation_id", "output_id", "target_type", "target_id");
    CREATE INDEX IF NOT EXISTS "idx_generation_attachment_target" ON "nodetool_generation_attachments" ("target_type", "target_id");
    CREATE INDEX IF NOT EXISTS "idx_generation_attachment_status" ON "nodetool_generation_attachments" ("status");

    CREATE TABLE IF NOT EXISTS "run_events" (
      "id" text PRIMARY KEY NOT NULL,
      "run_id" text NOT NULL,
      "seq" integer NOT NULL,
      "event_type" text NOT NULL,
      "event_time" text NOT NULL,
      "node_id" text,
      "payload" text
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_run_events_run_seq" ON "run_events" ("run_id", "seq");
    CREATE INDEX IF NOT EXISTS "idx_run_events_run_node" ON "run_events" ("run_id", "node_id");
    CREATE INDEX IF NOT EXISTS "idx_run_events_run_type" ON "run_events" ("run_id", "event_type");

    CREATE TABLE IF NOT EXISTS "nodetool_team_tasks" (
      "id" text PRIMARY KEY NOT NULL,
      "team_id" text NOT NULL,
      "title" text NOT NULL,
      "description" text NOT NULL DEFAULT '',
      "status" text NOT NULL DEFAULT 'open',
      "created_by" text NOT NULL,
      "claimed_by" text,
      "depends_on" text NOT NULL,
      "required_skills" text NOT NULL,
      "priority" integer NOT NULL DEFAULT 5,
      "artifacts" text NOT NULL,
      "parent_task_id" text,
      "result" text,
      "failure_reason" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_team_tasks_team_id" ON "nodetool_team_tasks" ("team_id");
    CREATE INDEX IF NOT EXISTS "idx_team_tasks_status" ON "nodetool_team_tasks" ("status");
    CREATE INDEX IF NOT EXISTS "idx_team_tasks_team_status" ON "nodetool_team_tasks" ("team_id", "status");
    CREATE INDEX IF NOT EXISTS "idx_team_tasks_parent" ON "nodetool_team_tasks" ("parent_task_id");

    CREATE TABLE IF NOT EXISTS "nodetool_settings" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "key" text NOT NULL,
      "value" text NOT NULL,
      "description" text DEFAULT '',
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_settings_user_key" ON "nodetool_settings" ("user_id", "key");
    CREATE INDEX IF NOT EXISTS "idx_settings_user_id" ON "nodetool_settings" ("user_id");

    CREATE TABLE IF NOT EXISTS "timeline_sequences" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "project_id" text NOT NULL,
      "workflow_id" text,
      "name" text NOT NULL,
      "fps" integer NOT NULL DEFAULT 30,
      "width" integer NOT NULL DEFAULT 1920,
      "height" integer NOT NULL DEFAULT 1080,
      "duration_ms" integer NOT NULL DEFAULT 0,
      "document" text NOT NULL,
      "revision" integer NOT NULL DEFAULT 0,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_timeline_sequence_user" ON "timeline_sequences" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_timeline_sequence_project" ON "timeline_sequences" ("project_id");
    CREATE INDEX IF NOT EXISTS "idx_timeline_sequence_updated" ON "timeline_sequences" ("updated_at");

    CREATE TABLE IF NOT EXISTS "timeline_sequence_versions" (
      "id" text PRIMARY KEY NOT NULL,
      "timeline_id" text NOT NULL REFERENCES "timeline_sequences" ("id") ON DELETE CASCADE,
      "user_id" text NOT NULL,
      "name" text,
      "version" integer NOT NULL DEFAULT 1,
      "save_type" text NOT NULL DEFAULT 'manual',
      "fps" integer NOT NULL DEFAULT 30,
      "width" integer NOT NULL DEFAULT 1920,
      "height" integer NOT NULL DEFAULT 1080,
      "duration_ms" integer NOT NULL DEFAULT 0,
      "document" text NOT NULL,
      "created_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_tsv_timeline" ON "timeline_sequence_versions" ("timeline_id");
    CREATE INDEX IF NOT EXISTS "idx_tsv_user" ON "timeline_sequence_versions" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_tsv_timeline_save_type_created" ON "timeline_sequence_versions" ("timeline_id", "save_type", "created_at");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_tsv_timeline_version" ON "timeline_sequence_versions" ("timeline_id", "version");

    CREATE TABLE IF NOT EXISTS "image_documents" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "project_id" text NOT NULL,
      "workflow_id" text,
      "name" text NOT NULL,
      "width" integer NOT NULL DEFAULT 1024,
      "height" integer NOT NULL DEFAULT 1024,
      "background_color" text NOT NULL DEFAULT '#ffffff',
      "document" text NOT NULL,
      "thumbnail_asset_id" text,
      "revision" integer NOT NULL DEFAULT 0,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_image_document_user" ON "image_documents" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_image_document_project" ON "image_documents" ("project_id");
    CREATE INDEX IF NOT EXISTS "idx_image_document_updated" ON "image_documents" ("updated_at");

    CREATE TABLE IF NOT EXISTS "image_document_versions" (
      "id" text PRIMARY KEY NOT NULL,
      "image_document_id" text NOT NULL REFERENCES "image_documents" ("id") ON DELETE CASCADE,
      "user_id" text NOT NULL,
      "name" text,
      "version" integer NOT NULL DEFAULT 1,
      "save_type" text NOT NULL DEFAULT 'manual',
      "width" integer NOT NULL DEFAULT 1024,
      "height" integer NOT NULL DEFAULT 1024,
      "background_color" text NOT NULL DEFAULT '#ffffff',
      "document" text NOT NULL,
      "created_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_idv_document" ON "image_document_versions" ("image_document_id");
    CREATE INDEX IF NOT EXISTS "idx_idv_user" ON "image_document_versions" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_idv_document_save_type_created" ON "image_document_versions" ("image_document_id", "save_type", "created_at");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_idv_document_version" ON "image_document_versions" ("image_document_id", "version");

    CREATE TABLE IF NOT EXISTS "worker_profiles" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "target" text NOT NULL,
      "image" text NOT NULL,
      "spec" text NOT NULL,
      "token_policy" text NOT NULL,
      "idle_timeout_minutes" integer,
      "max_lifetime_minutes" integer,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_worker_profiles_name" ON "worker_profiles" ("name");
    CREATE TABLE IF NOT EXISTS "worker_instances" (
      "id" text PRIMARY KEY NOT NULL,
      "profile_name" text NOT NULL,
      "target" text NOT NULL,
      "provider_ref" text NOT NULL,
      "ws_url" text NOT NULL,
      "encrypted_token" text,
      "status" text NOT NULL,
      "attached_to" text,
      "created_at" text NOT NULL,
      "last_activity_at" text NOT NULL,
      "estimated_cost_usd" real
    );
    CREATE INDEX IF NOT EXISTS "idx_worker_instances_status" ON "worker_instances" ("status");
    CREATE INDEX IF NOT EXISTS "idx_worker_instances_profile_name" ON "worker_instances" ("profile_name");

    CREATE TABLE IF NOT EXISTS "run_inbox_messages" (
      "id" text PRIMARY KEY NOT NULL,
      "message_id" text NOT NULL,
      "run_id" text NOT NULL,
      "node_id" text NOT NULL,
      "handle" text NOT NULL,
      "msg_seq" integer NOT NULL,
      "payload_json" text,
      "payload_ref" text,
      "status" text NOT NULL,
      "claim_worker_id" text,
      "claim_expires_at" text,
      "consumed_at" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_inbox_run_node_handle_seq" ON "run_inbox_messages" ("run_id", "node_id", "handle", "msg_seq");
    CREATE INDEX IF NOT EXISTS "idx_inbox_run_node_handle_status" ON "run_inbox_messages" ("run_id", "node_id", "handle", "status");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_inbox_message_id" ON "run_inbox_messages" ("message_id");

    CREATE TABLE IF NOT EXISTS "trigger_inputs" (
      "id" text PRIMARY KEY NOT NULL,
      "input_id" text NOT NULL,
      "run_id" text NOT NULL,
      "node_id" text NOT NULL,
      "payload_json" text,
      "processed" integer NOT NULL DEFAULT 0,
      "processed_at" text,
      "cursor" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_trigger_input_run_node_processed" ON "trigger_inputs" ("run_id", "node_id", "processed");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_trigger_input_id" ON "trigger_inputs" ("input_id");

    CREATE TABLE IF NOT EXISTS "trigger_registrations" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "workflow_id" text NOT NULL,
      "node_id" text NOT NULL,
      "kind" text NOT NULL,
      "config_json" text,
      "enabled" integer NOT NULL DEFAULT 1,
      "cursor" text,
      "last_fired_at" text,
      "last_error" text,
      "disabled_reason" text,
      "consecutive_failures" integer NOT NULL DEFAULT 0,
      "run_count" integer NOT NULL DEFAULT 0,
      "expires_at" text,
      "max_runs" integer,
      "supervise" integer NOT NULL DEFAULT 0,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_trigger_reg_workflow" ON "trigger_registrations" ("workflow_id");
    CREATE INDEX IF NOT EXISTS "idx_trigger_reg_kind_enabled" ON "trigger_registrations" ("kind", "enabled");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_trigger_reg_workflow_node" ON "trigger_registrations" ("workflow_id", "node_id");

    CREATE TABLE IF NOT EXISTS "nodetool_workflow_collaborators" (
      "id" text PRIMARY KEY NOT NULL,
      "workflow_id" text NOT NULL,
      "user_id" text NOT NULL,
      "role" text NOT NULL DEFAULT 'viewer',
      "invited_by" text NOT NULL,
      "created_at" text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_wcol_workflow_user" ON "nodetool_workflow_collaborators" ("workflow_id", "user_id");
    CREATE INDEX IF NOT EXISTS "idx_wcol_user_id" ON "nodetool_workflow_collaborators" ("user_id");

    CREATE TABLE IF NOT EXISTS "nodetool_workflow_shares" (
      "id" text PRIMARY KEY NOT NULL,
      "workflow_id" text NOT NULL,
      "token" text NOT NULL,
      "role" text NOT NULL DEFAULT 'viewer',
      "created_by" text NOT NULL,
      "created_at" text NOT NULL,
      "revoked_at" text
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_wshare_token" ON "nodetool_workflow_shares" ("token");
    CREATE INDEX IF NOT EXISTS "idx_wshare_workflow_id" ON "nodetool_workflow_shares" ("workflow_id");

    CREATE TABLE IF NOT EXISTS "storyboards" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "project_id" text NOT NULL,
      "name" text NOT NULL,
      "document" text NOT NULL,
      "timeline_id" text,
      "revision" integer NOT NULL DEFAULT 0,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_storyboard_user" ON "storyboards" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_storyboard_project" ON "storyboards" ("project_id");
    CREATE INDEX IF NOT EXISTS "idx_storyboard_updated" ON "storyboards" ("updated_at");

    CREATE TABLE IF NOT EXISTS "applications" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "project_id" text NOT NULL,
      "name" text NOT NULL,
      "description" text NOT NULL DEFAULT '',
      "document" text NOT NULL,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_application_user" ON "applications" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_application_project" ON "applications" ("project_id");
    CREATE INDEX IF NOT EXISTS "idx_application_updated" ON "applications" ("updated_at");

    CREATE TABLE IF NOT EXISTS "application_versions" (
      "id" text PRIMARY KEY NOT NULL,
      "application_id" text NOT NULL REFERENCES "applications" ("id") ON DELETE CASCADE,
      "user_id" text,
      "version" integer NOT NULL,
      "document" text NOT NULL,
      "capabilities" text NOT NULL,
      "workflow_graphs" text,
      "released" integer NOT NULL DEFAULT 0,
      "created_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_application_version_app" ON "application_versions" ("application_id");
    CREATE INDEX IF NOT EXISTS "idx_application_version_released" ON "application_versions" ("released");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_application_version_app_version" ON "application_versions" ("application_id", "version");

    CREATE TABLE IF NOT EXISTS "application_deployments" (
      "id" text PRIMARY KEY NOT NULL,
      "application_id" text NOT NULL REFERENCES "applications" ("id") ON DELETE CASCADE,
      "user_id" text NOT NULL,
      "token" text NOT NULL,
      "created_at" text NOT NULL,
      "revoked_at" text
    );
    CREATE INDEX IF NOT EXISTS "idx_application_deployment_app" ON "application_deployments" ("application_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_application_deployment_token" ON "application_deployments" ("token");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_application_deployment_one_live" ON "application_deployments" ("application_id") WHERE "revoked_at" IS NULL;

    CREATE TABLE IF NOT EXISTS "application_budgets" (
      "application_id" text PRIMARY KEY NOT NULL REFERENCES "applications" ("id") ON DELETE CASCADE,
      "period" text NOT NULL DEFAULT 'month',
      "max_usd" real,
      "max_invocations" integer,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "application_invocations" (
      "id" text PRIMARY KEY NOT NULL,
      "application_id" text NOT NULL REFERENCES "applications" ("id") ON DELETE CASCADE,
      "user_id" text,
      "version" integer,
      "invocation_id" text NOT NULL,
      "operation_id" text NOT NULL DEFAULT '',
      "estimated_usd" real NOT NULL DEFAULT 0,
      "actual_usd" real,
      "status" text NOT NULL DEFAULT 'running',
      "created_at" text NOT NULL,
      "settled_at" text
    );
    CREATE INDEX IF NOT EXISTS "idx_application_invocation_app" ON "application_invocations" ("application_id");
    CREATE INDEX IF NOT EXISTS "idx_application_invocation_created" ON "application_invocations" ("created_at");
    CREATE INDEX IF NOT EXISTS "idx_application_invocation_invocation" ON "application_invocations" ("invocation_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_application_invocation_app_invocation" ON "application_invocations" ("application_id", "invocation_id");

    CREATE TABLE IF NOT EXISTS "nodetool_credit_ledger" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "delta" integer NOT NULL,
      "kind" text NOT NULL,
      "description" text,
      "period_key" text,
      "created_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_credit_ledger_user" ON "nodetool_credit_ledger" ("user_id");

    CREATE TABLE IF NOT EXISTS "nodetool_user_subscriptions" (
      "user_id" text PRIMARY KEY NOT NULL,
      "plan_id" text NOT NULL DEFAULT 'free',
      "status" text NOT NULL DEFAULT 'active',
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "projects" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "name" text NOT NULL,
      "kind" text NOT NULL DEFAULT '',
      "archived_at" text,
      "deleted_at" text,
      "thread_id" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_project_user" ON "projects" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_project_updated" ON "projects" ("updated_at");
    CREATE INDEX IF NOT EXISTS "idx_project_lifecycle" ON "projects" ("user_id", "archived_at", "deleted_at");

    CREATE TABLE IF NOT EXISTS "games" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "project_id" text NOT NULL,
      "workspace_id" text NOT NULL,
      "name" text NOT NULL,
      "source_root" text NOT NULL,
      "current_revision" text NOT NULL,
      "draft_updated_at" text NOT NULL DEFAULT '',
      "draft_base_revision" text NOT NULL DEFAULT '',
      "draft_version_id" text NOT NULL DEFAULT '',
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_game_user_project" ON "games" ("user_id", "project_id");
    CREATE INDEX IF NOT EXISTS "idx_game_workspace" ON "games" ("workspace_id");

    CREATE TABLE IF NOT EXISTS "game_draft_changes" (
      "id" text PRIMARY KEY NOT NULL,
      "game_id" text NOT NULL,
      "actor" text NOT NULL,
      "thread_id" text,
      "message_id" text,
      "ops" text NOT NULL,
      "summary" text NOT NULL,
      "before_updated_at" text NOT NULL,
      "before_digest" text NOT NULL,
      "created_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_game_draft_change_game_created" ON "game_draft_changes" ("game_id", "created_at");

    CREATE TABLE IF NOT EXISTS "game_revision_messages" (
      "revision" text PRIMARY KEY NOT NULL,
      "game_id" text NOT NULL,
      "message" text,
      "created_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_game_revision_message_game" ON "game_revision_messages" ("game_id");

    CREATE TABLE IF NOT EXISTS "scripts" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "project_id" text NOT NULL,
      "name" text NOT NULL,
      "document" text NOT NULL,
      "timeline_id" text,
      "storyboard_id" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_script_user" ON "scripts" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_script_project" ON "scripts" ("project_id");
    CREATE INDEX IF NOT EXISTS "idx_script_updated" ON "scripts" ("updated_at");

    CREATE TABLE IF NOT EXISTS "js_scripts" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "project_id" text NOT NULL,
      "name" text NOT NULL,
      "document" text NOT NULL,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_js_script_user" ON "js_scripts" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_js_script_project" ON "js_scripts" ("project_id");
    CREATE INDEX IF NOT EXISTS "idx_js_script_updated" ON "js_scripts" ("updated_at");

    CREATE TABLE IF NOT EXISTS "js_script_versions" (
      "id" text PRIMARY KEY NOT NULL,
      "js_script_id" text NOT NULL REFERENCES "js_scripts" ("id") ON DELETE CASCADE,
      "user_id" text NOT NULL,
      "name" text,
      "version" integer NOT NULL DEFAULT 1,
      "save_type" text NOT NULL DEFAULT 'manual',
      "document" text NOT NULL,
      "created_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_jsv_script" ON "js_script_versions" ("js_script_id");
    CREATE INDEX IF NOT EXISTS "idx_jsv_user" ON "js_script_versions" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_jsv_script_save_type_created" ON "js_script_versions" ("js_script_id", "save_type", "created_at");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_jsv_script_version" ON "js_script_versions" ("js_script_id", "version");

    CREATE TABLE IF NOT EXISTS "skills" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "name" text NOT NULL,
      "description" text NOT NULL DEFAULT '',
      "content" text NOT NULL DEFAULT '',
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_skills_user" ON "skills" ("user_id");
    CREATE INDEX IF NOT EXISTS "idx_skills_user_name" ON "skills" ("user_id", "name");
    CREATE INDEX IF NOT EXISTS "idx_skills_updated" ON "skills" ("updated_at");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_skills_user_name_unique" ON "skills" ("user_id", "name");

    CREATE TABLE IF NOT EXISTS "nodetool_memories" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "thread_id" text NOT NULL DEFAULT '',
      "kind" text NOT NULL DEFAULT 'note',
      "title" text NOT NULL DEFAULT '',
      "content" text NOT NULL DEFAULT '',
      "resources" text,
      "metadata" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_memory_user_created" ON "nodetool_memories" ("user_id", "created_at");
    CREATE INDEX IF NOT EXISTS "idx_memory_thread_created" ON "nodetool_memories" ("thread_id", "created_at");

    CREATE TABLE IF NOT EXISTS "external_identities" (
      "id" text PRIMARY KEY NOT NULL,
      "provider" text NOT NULL,
      "external_id" text NOT NULL,
      "user_id" text NOT NULL,
      "linked_at" text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_external_identity_provider_external" ON "external_identities" ("provider", "external_id");
    CREATE INDEX IF NOT EXISTS "idx_external_identity_user" ON "external_identities" ("user_id");

    CREATE TABLE IF NOT EXISTS "access_tokens" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "name" text NOT NULL,
      "secret_hash" text NOT NULL,
      "created_at" text NOT NULL,
      "expires_at" text,
      "last_used_at" text
    );
    CREATE INDEX IF NOT EXISTS "idx_access_token_user" ON "access_tokens" ("user_id");

    CREATE TABLE IF NOT EXISTS "mcp_oauth_clients" (
      "id" text PRIMARY KEY NOT NULL,
      "client_name" text NOT NULL,
      "redirect_uris" text NOT NULL,
      "created_at" text NOT NULL,
      "last_used_at" text
    );

    CREATE TABLE IF NOT EXISTS "mcp_oauth_grants" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "client_id" text NOT NULL,
      "client_name" text NOT NULL,
      "scope" text NOT NULL,
      "resource" text NOT NULL,
      "created_at" text NOT NULL,
      "revoked_at" text
    );
    CREATE INDEX IF NOT EXISTS "idx_mcp_oauth_grant_user" ON "mcp_oauth_grants" ("user_id");

    CREATE TABLE IF NOT EXISTS "mcp_oauth_tokens" (
      "id" text PRIMARY KEY NOT NULL,
      "grant_id" text NOT NULL,
      "kind" text NOT NULL,
      "secret_hash" text NOT NULL,
      "expires_at" text NOT NULL,
      "rotated_from" text,
      "last_used_at" text
    );
    CREATE INDEX IF NOT EXISTS "idx_mcp_oauth_token_grant" ON "mcp_oauth_tokens" ("grant_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_mcp_oauth_token_rotated_from" ON "mcp_oauth_tokens" ("rotated_from");

    CREATE TABLE IF NOT EXISTS "nodetool_user_events" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "event_type" text NOT NULL,
      "subject_type" text,
      "subject_id" text,
      "metadata" text,
      "created_at" text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_user_event_user_created" ON "nodetool_user_events" ("user_id", "created_at");
    CREATE INDEX IF NOT EXISTS "idx_user_event_type_created" ON "nodetool_user_events" ("event_type", "created_at");
  `;
}

function getCreateTableStatementsSql(): string {
  return getCreateSchemaSql()
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.startsWith("CREATE TABLE"))
    .join(";\n");
}

function getCreateIndexStatementsSql(): string {
  return getCreateSchemaSql()
    .split(";")
    .map((statement) => statement.trim())
    .filter(
      (statement) =>
        statement.startsWith("CREATE INDEX") ||
        statement.startsWith("CREATE UNIQUE INDEX")
    )
    .join(";\n");
}

function repairApplicationConstraintDuplicates(
  sqlite: Database.Database
): void {
  // The indexes are what the repair exists for, so their presence is the
  // record that it already ran. Without this the two scans below run on every
  // start, forever, over a table that grows with every app run.
  const existing = sqlite
    .prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'index'
          AND name IN (
            'idx_application_deployment_one_live',
            'idx_application_invocation_app_invocation'
          )`
    )
    .all() as { name: string }[];
  if (existing.length === 2) return;

  const revokedAt = new Date().toISOString();
  const repair = sqlite.transaction(() => {
    sqlite
      .prepare(
        `UPDATE application_deployments AS deployment
            SET revoked_at = ?
          WHERE deployment.revoked_at IS NULL
            AND EXISTS (
              SELECT 1
                FROM application_deployments AS newer
               WHERE newer.application_id = deployment.application_id
                 AND newer.revoked_at IS NULL
                 AND (
                   newer.created_at > deployment.created_at
                   OR (
                     newer.created_at = deployment.created_at
                     AND newer.id > deployment.id
                   )
                 )
            )`
      )
      .run(revokedAt);
    sqlite
      .prepare(
        `UPDATE application_invocations AS invocation
            SET invocation_id = 'legacy:' || invocation.id
          WHERE EXISTS (
            SELECT 1
              FROM application_invocations AS newer
             WHERE newer.application_id = invocation.application_id
               AND newer.invocation_id = invocation.invocation_id
               AND (
                 newer.created_at > invocation.created_at
                 OR (
                   newer.created_at = invocation.created_at
                   AND newer.id > invocation.id
                 )
               )
          )`
      )
      .run();
  });
  repair();
}

/** Compatibility columns are pinned to the baseline, never the live Drizzle schema. */
export const TABLE_COLUMNS: Record<string, Record<string, string>> = (() => {
  const baseline = new Database(":memory:");
  try {
    baseline.exec(getCreateSchemaSql());
    const tables = baseline
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    return Object.fromEntries(
      tables.map(({ name }) => {
        const columns = baseline.pragma(`table_info("${name}")`) as Array<{
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
        }>;
        return [
          name,
          Object.fromEntries(
            columns.map((column) => [
              column.name,
              column.type.toLowerCase() +
                (column.notnull && column.dflt_value !== null
                  ? ` NOT NULL DEFAULT ${column.dflt_value}`
                  : "")
            ])
          )
        ];
      })
    );
  } finally {
    baseline.close();
  }
})();

/** Apply the historical additive repair and identity constraints atomically. */
export function applySqliteBaseline(sqlite: Database.Database): void {
  sqlite.transaction(() => {
    sqlite.exec(getCreateTableStatementsSql());
    for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
      const existing = new Set(
        (
          sqlite.pragma(`table_info("${table}")`) as Array<{ name: string }>
        ).map((column) => column.name)
      );
      for (const [name, definition] of Object.entries(columns)) {
        if (!existing.has(name)) {
          sqlite.exec(
            `ALTER TABLE "${table}" ADD COLUMN "${name}" ${definition}`
          );
        }
      }
    }
    repairApplicationConstraintDuplicates(sqlite);
    sqlite.exec(getCreateIndexStatementsSql());
  })();
}
