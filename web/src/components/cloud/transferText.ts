/**
 * The sentences of the desktop review sheet, from the controller's message
 * keys and the rows' details. The wording follows the Qt sheet
 * (native/account/qt/src/TransferController.cpp).
 */
import type { TFunction } from "i18next";

import type { TransferMessage, TransferRowView } from "../../lib/cloud/TransferController";
import type { TransferStatus } from "../../lib/cloud/transferCalls";

const statusText = (t: TFunction, status: Exclude<TransferStatus, "ok">, reason: string): string => {
  switch (status) {
    case "signedOut":
      return t("cloudTransfer.message.signedOut");
    case "offline":
      return t("cloudTransfer.message.offline");
    case "localUnavailable":
      return t("cloudTransfer.message.localUnavailable");
    case "cancelled":
      return t("cloudTransfer.message.cancelled");
    case "refused":
      return t("cloudTransfer.message.refused", { reason });
  }
};

export const transferMessageText = (t: TFunction, message: TransferMessage): string => {
  switch (message.key) {
    case "signInToPublish":
      return t("cloudTransfer.message.signInToPublish");
    case "signInToSynchronize":
      return t("cloudTransfer.message.signInToSynchronize");
    case "noProject":
      return t("cloudTransfer.message.noProject");
    case "linkedElsewhere":
      return t("cloudTransfer.message.linkedElsewhere");
    case "failure":
      return statusText(t, message.status, message.reason);
    case "serverMessage":
      return t("cloudTransfer.message.collectFirst");
    case "receiveExpired":
      return t("cloudTransfer.message.receiveExpired");
    case "receiveChangedWhileOpen":
      return t("cloudTransfer.message.receiveChangedWhileOpen");
    case "receivingChangedAgain":
      return t("cloudTransfer.message.receivingChangedAgain");
    case "chooseAgain":
      return t("cloudTransfer.message.chooseAgain", { count: message.count });
    case "cloudChangedChooseAgain":
      return t("cloudTransfer.message.cloudChangedChooseAgain", { count: message.count });
    case "notPreparedAgain":
      return t("cloudTransfer.message.notPreparedAgain", {
        reason: statusText(t, message.status, message.reason)
      });
    case "sendChangedWhileOpen":
      return t("cloudTransfer.message.sendChangedWhileOpen");
    case "missingFilesUnconfirmed":
      return t("cloudTransfer.message.missingFilesUnconfirmed");
    case "sendRefused":
      return t("cloudTransfer.message.sendRefused", { reasons: message.reasons.join("; ") });
    case "notCollected":
      return t("cloudTransfer.message.notCollected", { files: message.files.join("; ") });
    case "collectInterrupted":
      return t("cloudTransfer.message.collectInterrupted");
  }
};

const sendText = (t: TFunction, row: TransferRowView): string => {
  switch (row.detail) {
    case "create_document":
      return t("cloudTransfer.row.createDocument");
    case "replace_document":
      return t("cloudTransfer.row.replaceDocument");
    case "rename_document":
      return t("cloudTransfer.row.renameDocument", { name: row.name });
    case "keep_both":
      return t("cloudTransfer.row.keepBoth");
    case "add_versions":
      return t("cloudTransfer.row.addVersions");
    case "put_asset_file":
      return t("cloudTransfer.row.putAssetFile");
    case "put_workspace_file":
      return t("cloudTransfer.row.putWorkspaceFile");
    case "new_workspace_file":
      return t("cloudTransfer.row.newWorkspaceFile");
    default:
      return row.detail;
  }
};

const problemText = (t: TFunction, detail: string): string => {
  // A missing file reads "file <asset>: <reason>".
  const colon = detail.indexOf(": ");
  const reason = detail.startsWith("file ") && colon !== -1 ? detail.slice(colon + 2) : detail;
  switch (reason) {
    case "missing_locally":
      return t("cloudTransfer.row.missingLocally");
    case "too_large":
      return t("cloudTransfer.row.tooLarge");
    case "over_allowance":
      return t("cloudTransfer.row.overAllowance");
    default:
      return t("cloudTransfer.row.cannotSend", { reason });
  }
};

const detailText = (t: TFunction, row: TransferRowView): string => {
  switch (row.section) {
    case "send":
      return sendText(t, row);
    case "receive":
      if (row.detail === "new" || row.detail === "workspace_new") {
        return t("cloudTransfer.row.newInCloud");
      }
      if (row.detail === "workspace_both_changed") {
        return t("cloudTransfer.row.workspaceBothChanged");
      }
      if (row.detail === "workspace_local_deleted") {
        return t("cloudTransfer.row.workspaceLocalDeleted");
      }
      if (row.detail === "workspace_cloud_deleted") {
        return t("cloudTransfer.row.workspaceCloudDeleted");
      }
      if (row.detail === "cloud_file_changed") {
        return t("cloudTransfer.row.cloudFileChanged");
      }
      return t("cloudTransfer.row.cloudChanged");
    case "choice":
      return t("cloudTransfer.row.bothChanged");
    case "deletion":
      return row.detail === "cloud_changed"
        ? t("cloudTransfer.row.deletedCloudChanged")
        : t("cloudTransfer.row.deleted");
    case "problem":
      return problemText(t, row.detail);
  }
};

/** What a row says about its document (CF3, review F56 for a missing document file). */
export const transferRowText = (t: TFunction, row: TransferRowView): string => {
  if (row.section === "send" && row.documentFileMissing) {
    const missing = t("cloudTransfer.row.documentFileMissing");
    return row.detail === "document_file_missing" ? missing : `${detailText(t, row)}. ${missing}`;
  }
  return detailText(t, row);
};
