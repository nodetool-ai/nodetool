/**
 * Cloud transfer router: the transfer client of the server bundled with a
 * native app (docs/plans/native-cloud-sync/technical-design.md, K9, WP2.7).
 *
 * The app names the cloud server origin and account and, for the calls that
 * reach the cloud, the short-lived access token (SR3). The server key is
 * derived from the origin here, and a send or receive is continued only for
 * the server and account it was captured for, so a token never reaches
 * another server's transfer. Rows belong to the local caller.
 *
 * A server on PostgreSQL is a cloud deployment and has no local projects to
 * transfer, so every procedure answers SERVICE_UNAVAILABLE there.
 */
import { getCloudLink, getCloudLinkById, getCloudReceive, getCloudSend, getDbType } from "@nodetool-ai/models";
import type { CloudLinkRow } from "@nodetool-ai/models";
import { ApiErrorCode } from "@nodetool-ai/protocol/api-schemas/api-error-code.js";
import {
  cancelSendInput,
  cancelSendOutput,
  captureReceiveInput,
  captureReceiveOutput,
  captureSendInput,
  captureSendOutput,
  resumeTransfersInput,
  resumeTransfersOutput,
  runReceiveInput,
  runReceiveOutput,
  runSendInput,
  runSendOutput,
  type CloudTransferAccount,
  type RunReceiveOutput,
  type RunSendOutput
} from "@nodetool-ai/protocol/api-schemas/cloud-transfer-local.js";
import { CloudRequestError, CloudSignedOutError } from "@nodetool-ai/project-services/cloud-http-transport";
import { CloudOriginError, cloudServerKey } from "@nodetool-ai/project-services/cloud-origin";
import {
  captureReceive,
  resumeReceives,
  runReceive,
  type ReceiveOutcome
} from "@nodetool-ai/project-services/cloud-receive-client";
import {
  cancelSend,
  captureSend,
  resumeSends,
  runSend,
  SendCaptureError,
  type SendOutcome,
  type SendRunOptions,
  type SendTarget
} from "@nodetool-ai/project-services/cloud-send-client";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { cloudTransport } from "../../lib/cloud-transfer-transport.js";

/** The server key of the call's origin, on a local server only. */
function serverKeyOf(input: CloudTransferAccount): string {
  if (getDbType() !== "sqlite") {
    throwApiError(ApiErrorCode.SERVICE_UNAVAILABLE, "Cloud transfers run only on a local server");
  }
  try {
    return cloudServerKey(input.origin);
  } catch (error) {
    if (error instanceof CloudOriginError) throwApiError(ApiErrorCode.INVALID_INPUT, error.message);
    throw error;
  }
}

/** Maps what the cloud answered to an error the app can act on. */
async function reachingCloud<T>(body: () => Promise<T>): Promise<T> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof CloudSignedOutError) throwApiError(ApiErrorCode.CLOUD_SIGNED_OUT, error.message);
    if (error instanceof CloudRequestError) {
      throwApiError(
        error.retryable ? ApiErrorCode.CLOUD_UNREACHABLE : ApiErrorCode.CLOUD_REFUSED,
        `${error.code}: ${error.message}`
      );
    }
    if (error instanceof CloudOriginError) throwApiError(ApiErrorCode.CLOUD_REFUSED, error.message);
    throw error;
  }
}

function notFound(what: string): never {
  throwApiError(ApiErrorCode.NOT_FOUND, `No ${what} of this account is in progress`);
}

function linkMatches(link: CloudLinkRow, serverKey: string, accountId: string): boolean {
  return link.server_key === serverKey && link.account_id === accountId;
}

async function ownedSend(userId: string, transferId: string, serverKey: string, accountId: string) {
  const row = await getCloudSend(transferId);
  if (!row || row.user_id !== userId || row.server_key !== serverKey || row.account_id !== accountId) {
    notFound("send");
  }
  return row;
}

async function isReceiveOf(userId: string, setId: string, serverKey: string, accountId: string): Promise<boolean> {
  const row = await getCloudReceive(setId);
  const link = row && row.user_id === userId ? await getCloudLinkById(row.link_id) : null;
  return link !== null && linkMatches(link, serverKey, accountId);
}

async function ownedReceive(userId: string, setId: string, serverKey: string, accountId: string): Promise<void> {
  if (!(await isReceiveOf(userId, setId, serverKey, accountId))) notFound("receive");
}

function sendOutput(outcome: SendOutcome): RunSendOutput {
  return outcome.status === "committed"
    ? { status: "committed", transfer_id: outcome.transferId, result: outcome.result }
    : { status: "refused", transfer_id: outcome.transferId, failures: outcome.failures };
}

function receiveOutput(outcome: ReceiveOutcome): RunReceiveOutput {
  if (outcome.status !== "finished") return { status: outcome.status, set_id: outcome.setId };
  const result = outcome.result;
  return {
    status: "finished",
    set_id: outcome.setId,
    result: {
      received: result.received,
      changed_during_receive: result.changedDuringReceive,
      not_received: result.notReceived,
      kept_beside: result.keptBeside.map((entry) => ({
        asset_id: entry.assetId,
        path: entry.path,
        kept_path: entry.keptPath
      })),
      missing_files: result.missingFiles,
      file_kept: result.fileKept
    }
  };
}

export const cloudTransferRouter = router({
  send: router({
    /** Captures the project for the review sheet. Nothing reaches the cloud yet. */
    capture: protectedProcedure
      .input(captureSendInput)
      .output(captureSendOutput)
      .mutation(async ({ ctx, input }) => {
        const serverKey = serverKeyOf(input);
        const link = await getCloudLink(ctx.userId, input.project_id);
        if (link && !linkMatches(link, serverKey, input.account_id)) {
          throwApiError(ApiErrorCode.ALREADY_EXISTS, "This project is linked to another cloud server or account");
        }
        try {
          const target: SendTarget = {
            userId: ctx.userId,
            projectId: input.project_id,
            serverKey,
            accountId: input.account_id
          };
          if (input.project_name) target.projectName = input.project_name;
          if (input.device_name) target.deviceName = input.device_name;
          const review = await captureSend(target);
          return {
            status: "captured" as const,
            transfer_id: review.transferId,
            first_publication: review.firstPublication,
            operations: review.operations,
            documents: review.documents.map((document) => ({
              kind: document.kind,
              local_id: document.localId,
              cloud_id: document.cloudId,
              name: document.name
            })),
            missing_files: review.missingFiles,
            skipped: review.skipped,
            deleted_locally: review.deletedLocally.map((entry) => ({
              kind: entry.kind,
              local_id: entry.localId,
              cloud_id: entry.cloudId,
              base_hash: entry.baseHash
            }))
          };
        } catch (error) {
          if (error instanceof SendCaptureError) {
            return { status: "collect_first" as const, external: error.external, message: error.message };
          }
          throw error;
        }
      }),

    /** Sends a captured transfer, or continues one a crash interrupted. */
    run: protectedProcedure
      .input(runSendInput)
      .output(runSendOutput)
      .mutation(async ({ ctx, input }) => {
        const serverKey = serverKeyOf(input);
        await ownedSend(ctx.userId, input.transfer_id, serverKey, input.account_id);
        const transport = cloudTransport(input.origin, input.access_token);
        const options: SendRunOptions = {};
        if (input.decisions) options.decisions = input.decisions;
        if (input.confirm_deletes) options.confirmDeletes = input.confirm_deletes;
        const outcome = await reachingCloud(() => runSend(transport, input.transfer_id, options));
        return sendOutput(outcome);
      }),

    cancel: protectedProcedure
      .input(cancelSendInput)
      .output(cancelSendOutput)
      .mutation(async ({ ctx, input }) => {
        const serverKey = serverKeyOf(input);
        await ownedSend(ctx.userId, input.transfer_id, serverKey, input.account_id);
        const transport = cloudTransport(input.origin, input.access_token);
        return { state: await reachingCloud(() => cancelSend(transport, input.transfer_id)) };
      })
  }),

  receive: router({
    /** Captures a revision set of the linked cloud project for the review sheet. */
    capture: protectedProcedure
      .input(captureReceiveInput)
      .output(captureReceiveOutput)
      .mutation(async ({ ctx, input }) => {
        const serverKey = serverKeyOf(input);
        const link = await getCloudLink(ctx.userId, input.project_id);
        if (!link || !linkMatches(link, serverKey, input.account_id)) {
          throwApiError(ApiErrorCode.NOT_FOUND, "This project is not linked to a cloud project of this account");
        }
        const transport = cloudTransport(input.origin, input.access_token);
        const captured = await reachingCloud(() => captureReceive(transport, link));
        return {
          set_id: captured.setId,
          documents: captured.documents.map((document) => ({
            kind: document.kind,
            cloud_id: document.cloudId,
            local_id: document.localId,
            name: document.name,
            content_hash: document.contentHash,
            status: document.status,
            decision: document.decision,
            files: document.files,
            missing_files: document.missingFiles
          }))
        };
      }),

    /** Runs a captured receive with the person's decisions, or continues one a crash interrupted. */
    run: protectedProcedure
      .input(runReceiveInput)
      .output(runReceiveOutput)
      .mutation(async ({ ctx, input }) => {
        const serverKey = serverKeyOf(input);
        await ownedReceive(ctx.userId, input.set_id, serverKey, input.account_id);
        const transport = cloudTransport(input.origin, input.access_token);
        return receiveOutput(await reachingCloud(() => runReceive(transport, input.set_id, input.decisions)));
      })
  }),

  /** Continues every send and receive of this account a restart interrupted. */
  resume: protectedProcedure
    .input(resumeTransfersInput)
    .output(resumeTransfersOutput)
    .mutation(async ({ ctx, input }) => {
      const serverKey = serverKeyOf(input);
      const transport = cloudTransport(input.origin, input.access_token);
      const sends = await resumeSends(
        (send) => (send.serverKey === serverKey && send.accountId === input.account_id ? transport : null),
        ctx.userId
      );
      const outcomes = await resumeReceives(
        (link) => (linkMatches(link, serverKey, input.account_id) ? transport : null),
        ctx.userId
      );
      // A receive waiting for review is listed whatever its account. Name only this account's.
      const receives: ReceiveOutcome[] = [];
      for (const outcome of outcomes) {
        if (outcome.status !== "waiting_for_review") receives.push(outcome);
        else if (await isReceiveOf(ctx.userId, outcome.setId, serverKey, input.account_id)) receives.push(outcome);
      }
      return { sends: sends.map(sendOutput), receives: receives.map(receiveOutput) };
    })
});
