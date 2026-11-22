/**
 * The calls of the local `cloudTransfer` router that the desktop review
 * sheet makes (technical design WP2.14), as the native `LocalTransferClient`
 * makes them. The main process sends each call to the app's own local
 * server and adds the cloud origin, the account and the access token, so
 * the renderer names only the procedure's own fields. Every answer is
 * parsed at this boundary: one the router's schema does not accept is
 * refused with INVALID_RESPONSE, as the native client does.
 */
import type { z } from "zod";
import {
  cancelReceiveOutput,
  cancelSendOutput,
  captureReceiveOutput,
  captureSendOutput,
  linkStatusOutput,
  runReceiveOutput,
  runSendOutput,
  type CaptureReceiveOutput,
  type CaptureSendOutput,
  type LinkStatusOutput,
  type RunReceiveOutput,
  type RunSendOutput
} from "@nodetool-ai/protocol/api-schemas/cloud-transfer-local.js";

import type { CloudTransferResult } from "../../window";
import type {
  DeleteConfirmation,
  TransferDeletedFile,
  IncludedFile,
  KeepLocalDecision,
  ReceiveDecision,
  TransferMissingFile
} from "./transferReview";

/** One call of the local router, as `window.api.cloud.transfer` makes it. */
export type TransferCall = (procedure: string, input: Record<string, unknown>) => Promise<CloudTransferResult>;

export type TransferStatus = CloudTransferResult["status"];

/** An answer of the router, or why there is none. */
export type TransferAnswer<T> = { status: "ok"; data: T } | { status: Exclude<TransferStatus, "ok">; reason: string };

/** The desktop app's router call, or null outside the desktop app. */
export const desktopTransferCall = (): TransferCall | null => {
  const cloud = typeof window !== "undefined" ? window.api?.cloud : undefined;
  return cloud ? (procedure, input) => cloud.transfer({ procedure, input }) : null;
};

const answer = async <T>(
  call: TransferCall,
  procedure: string,
  input: Record<string, unknown>,
  schema: z.ZodType<T>
): Promise<TransferAnswer<T>> => {
  let result: CloudTransferResult;
  try {
    result = await call(procedure, input);
  } catch {
    return { status: "localUnavailable", reason: "" };
  }
  if (result.status !== "ok") {
    return { status: result.status, reason: result.reason };
  }
  const parsed = schema.safeParse(result.data);
  return parsed.success ? { status: "ok", data: parsed.data } : { status: "refused", reason: "INVALID_RESPONSE" };
};

export const linkStatus = (call: TransferCall, projectId: string): Promise<TransferAnswer<LinkStatusOutput>> =>
  answer(call, "cloudTransfer.link", { project_id: projectId }, linkStatusOutput);

export const captureSend = (
  call: TransferCall,
  projectId: string,
  projectName: string
): Promise<TransferAnswer<CaptureSendOutput>> =>
  answer(
    call,
    "cloudTransfer.send.capture",
    projectName === "" ? { project_id: projectId } : { project_id: projectId, project_name: projectName },
    captureSendOutput
  );

export const runSend = (
  call: TransferCall,
  transferId: string,
  decisions: readonly KeepLocalDecision[],
  confirmDeletes: readonly DeleteConfirmation[],
  confirmMissing: readonly TransferMissingFile[],
  confirmFileDeletes: readonly TransferDeletedFile[] = [],
  includeFiles: readonly IncludedFile[] = []
): Promise<TransferAnswer<RunSendOutput>> => {
  const input: Record<string, unknown> = {
    transfer_id: transferId,
    // Always the complete list, [] when every confirmation was withdrawn, so
    // the router never reuses the deletions of an earlier attempt (review F43).
    confirm_deletes: confirmDeletes.map((item) => ({
      kind: item.kind,
      cloud_id: item.cloudId,
      cloud_hash: item.cloudHash
    })),
    // Also always complete, for the same reason.
    confirm_workspace_deletes: confirmFileDeletes.map((item) => ({ path: item.path, base_hash: item.baseHash })),
    // Complete as well: a file left out on this attempt is not put.
    include_workspace_files: includeFiles.map((item) => ({ path: item.path, hash: item.hash }))
  };
  if (decisions.length > 0) {
    input.decisions = decisions.map((item) => ({
      kind: item.kind,
      document_id: item.documentId,
      choice: "keep_local",
      cloud_hash: item.cloudHash
    }));
  }
  if (confirmMissing.length > 0) {
    input.confirm_missing_files = confirmMissing;
  }
  return answer(call, "cloudTransfer.send.run", input, runSendOutput);
};

export const cancelSend = (call: TransferCall, transferId: string): Promise<TransferAnswer<z.infer<typeof cancelSendOutput>>> =>
  answer(call, "cloudTransfer.send.cancel", { transfer_id: transferId }, cancelSendOutput);

export const captureReceive = (call: TransferCall, projectId: string): Promise<TransferAnswer<CaptureReceiveOutput>> =>
  answer(call, "cloudTransfer.receive.capture", { project_id: projectId }, captureReceiveOutput);

export const runReceive = (
  call: TransferCall,
  setId: string,
  decisions: readonly ReceiveDecision[],
  includeFiles: readonly IncludedFile[] = []
): Promise<TransferAnswer<RunReceiveOutput>> => {
  const input: Record<string, unknown> = { set_id: setId };
  if (decisions.length > 0) {
    input.decisions = decisions.map((item) => ({
      kind: item.kind,
      document_id: item.documentId,
      decision: item.choice
    }));
  }
  // Always named, so a receive leaves out every workspace file the person did not tick (RW7).
  input.include_workspace_files = includeFiles.map((file) => ({ path: file.path, hash: file.hash }));
  return answer(call, "cloudTransfer.receive.run", input, runReceiveOutput);
};

export const cancelReceive = (
  call: TransferCall,
  setId: string
): Promise<TransferAnswer<z.infer<typeof cancelReceiveOutput>>> =>
  answer(call, "cloudTransfer.receive.cancel", { set_id: setId }, cancelReceiveOutput);
