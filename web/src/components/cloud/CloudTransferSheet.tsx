/**
 * The review sheet of File > Publish to Cloud and File > Synchronize in the
 * desktop app (technical design WP2.14). It shows what the controller holds:
 * the documents changed on both sides first, then what is received and sent,
 * deletions off by default, and what cannot be sent.
 */
import React, { useCallback, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import ErrorBanner from "../support/ErrorBanner";
import {
  AlertBanner,
  Caption,
  Checkbox,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  SPACING,
  Text,
  ToggleGroup,
  ToggleOption
} from "../ui_primitives";
import type {
  TransferController,
  TransferResult,
  TransferRowView
} from "../../lib/cloud/TransferController";
import type { ReceiveChoice, ReviewSection } from "../../lib/cloud/transferReview";
import { transferMessageText, transferRowText } from "./transferText";

interface CloudTransferSheetProps {
  controller: TransferController;
  onClose: () => void;
}

const SECTIONS: readonly ReviewSection[] = ["choice", "receive", "send", "deletion", "problem"];

interface RowProps {
  row: TransferRowView;
  controller: TransferController;
}

const TransferRow: React.FC<RowProps> = ({ row, controller }) => {
  const { t } = useTranslation();
  const handleChoice = useCallback(
    (_event: React.MouseEvent<HTMLElement>, value: ReceiveChoice | null) => {
      controller.choose(row.index, value);
    },
    [controller, row.index]
  );
  return (
    <FlexRow gap={SPACING.md} align="center" justify="space-between" data-testid="transfer-row">
      <FlexColumn gap={SPACING.xs}>
        <Text>{row.label}</Text>
        <Caption>{transferRowText(t, row)}</Caption>
      </FlexColumn>
      {row.section === "choice" && (
        <ToggleGroup
          exclusive
          size="small"
          value={row.choice}
          onChange={handleChoice}
          aria-label={t("cloudTransfer.choice.label", { name: row.label })}
        >
          <ToggleOption value="receive" disabled={!row.canReceive}>
            {t("cloudTransfer.choice.receive")}
          </ToggleOption>
          <ToggleOption value="keep_local">{t("cloudTransfer.choice.keepLocal")}</ToggleOption>
        </ToggleGroup>
      )}
      {row.optional && (
        <Checkbox
          compact
          checked={row.confirmed}
          onChange={(event) => controller.includeFile(row.index, event.target.checked)}
          label={t("cloudTransfer.include")}
        />
      )}
      {row.section === "deletion" && row.canKeepDeletion && (
        <Checkbox
          compact
          checked={row.confirmed}
          onChange={(event) => controller.confirmDeletion(row.index, event.target.checked)}
          label={t("cloudTransfer.deletion.confirm")}
        />
      )}
      {row.section === "problem" && row.canSendWithout && (
        <Checkbox
          compact
          checked={row.confirmed}
          onChange={(event) => controller.confirmMissingFile(row.index, event.target.checked)}
          label={t("cloudTransfer.missing.confirm")}
        />
      )}
    </FlexRow>
  );
};

const sectionTitle = (t: ReturnType<typeof useTranslation>["t"], section: ReviewSection): string => {
  switch (section) {
    case "choice":
      return t("cloudTransfer.section.choice");
    case "receive":
      return t("cloudTransfer.section.receive");
    case "send":
      return t("cloudTransfer.section.send");
    case "deletion":
      return t("cloudTransfer.section.deletion");
    case "problem":
      return t("cloudTransfer.section.problem");
  }
};

const ResultSummary: React.FC<{ result: TransferResult | null }> = ({ result }) => {
  const { t } = useTranslation();
  return (
    <FlexColumn gap={SPACING.sm}>
      <Text>{result?.published ? t("cloudTransfer.done.published") : t("cloudTransfer.done.synchronized")}</Text>
      {result && result.received.length > 0 && (
        <Caption>{t("cloudTransfer.done.received", { names: result.received.join(", ") })}</Caption>
      )}
      {result && result.notReceived.length > 0 && (
        <Caption>{t("cloudTransfer.done.notReceived", { names: result.notReceived.join(", ") })}</Caption>
      )}
      {result && result.changedDuringReceive.length > 0 && (
        <Caption>
          {t("cloudTransfer.done.changedDuringReceive", { names: result.changedDuringReceive.join(", ") })}
        </Caption>
      )}
      {result && result.missingFiles > 0 && (
        <Caption>{t("cloudTransfer.done.missingFiles", { count: result.missingFiles })}</Caption>
      )}
    </FlexColumn>
  );
};

const CloudTransferSheet: React.FC<CloudTransferSheetProps> = ({ controller, onClose }) => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const { stage, rows, message, linked } = snapshot;
  const busy = stage === "capturing" || stage === "running" || stage === "collecting";

  const handleClose = useCallback(() => {
    if (stage === "running") {
      return;
    }
    controller.cancel();
    onClose();
  }, [stage, controller, onClose]);
  const handleApply = useCallback(() => {
    void controller.apply();
  }, [controller]);
  const handleRetry = useCallback(() => {
    void controller.start();
  }, [controller]);
  const handleCollect = useCallback(() => {
    void controller.collect();
  }, [controller]);

  const messageText = message === null ? null : transferMessageText(t, message);
  const actions =
    stage === "reviewing" ? (
      <FlexRow gap={SPACING.sm}>
        <EditorButton variant="text" onClick={handleClose}>
          {t("cloudTransfer.cancel")}
        </EditorButton>
        <EditorButton variant="contained" onClick={handleApply} disabled={!snapshot.ready}>
          {linked ? t("cloudTransfer.apply.synchronize") : t("cloudTransfer.apply.publish")}
        </EditorButton>
      </FlexRow>
    ) : stage === "collectFirst" && controller.canCollect ? (
      <FlexRow gap={SPACING.sm}>
        <EditorButton variant="text" onClick={handleClose}>
          {t("cloudTransfer.cancel")}
        </EditorButton>
        <EditorButton variant="contained" onClick={handleCollect}>
          {t("cloudTransfer.collect")}
        </EditorButton>
      </FlexRow>
    ) : (
      <EditorButton variant={stage === "finished" ? "contained" : "text"} onClick={handleClose} disabled={stage === "running"}>
        {stage === "capturing" || stage === "collecting" ? t("cloudTransfer.cancel") : t("cloudTransfer.close")}
      </EditorButton>
    );

  return (
    <Dialog
      open
      onClose={handleClose}
      title={linked ? t("cloudTransfer.title.synchronize") : t("cloudTransfer.title.publish")}
      actions={actions}
    >
      <FlexColumn gap={SPACING.md}>
        {busy && (
          <FlexRow gap={SPACING.sm} align="center">
            <LoadingSpinner size="small" />
            <Text>
              {stage === "capturing"
                ? t("cloudTransfer.capturing")
                : stage === "collecting"
                  ? t("cloudTransfer.collecting")
                  : t("cloudTransfer.running")}
            </Text>
          </FlexRow>
        )}
        {stage === "failed" && messageText !== null && (
          <ErrorBanner
            report={{ source: "operation-failure", summary: "Cloud transfer failed", errorText: messageText }}
            onRetry={handleRetry}
            retryLabel={t("cloudTransfer.tryAgain")}
          >
            {messageText}
          </ErrorBanner>
        )}
        {stage === "collectFirst" && (
          <FlexColumn gap={SPACING.sm}>
            <Text>{t("cloudTransfer.message.collectFirst")}</Text>
            {snapshot.external.map((path) => (
              <Caption key={path}>{path}</Caption>
            ))}
          </FlexColumn>
        )}
        {stage === "reviewing" && (
          <>
            {messageText !== null && <AlertBanner severity="warning">{messageText}</AlertBanner>}
            {rows.length === 0 && <Text>{t("cloudTransfer.nothing")}</Text>}
            {SECTIONS.map((section) => {
              const sectionRows = rows.filter((row) => row.section === section);
              if (sectionRows.length === 0) {
                return null;
              }
              return (
                <FlexColumn key={section} gap={SPACING.sm}>
                  <Label>{sectionTitle(t, section)}</Label>
                  {section === "deletion" && <Caption>{t("cloudTransfer.deletion.note")}</Caption>}
                  {sectionRows.map((row) => (
                    <TransferRow key={`${row.section}-${row.index}`} row={row} controller={controller} />
                  ))}
                </FlexColumn>
              );
            })}
          </>
        )}
        {stage === "finished" && <ResultSummary result={snapshot.result} />}
      </FlexColumn>
    </Dialog>
  );
};

export default CloudTransferSheet;
