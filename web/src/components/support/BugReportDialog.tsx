/**
 * The bug-report form. Collects what happened, shows exactly which data will
 * leave the machine, and builds a zip of what the reporter left checked.
 *
 * Where the zip goes depends on where NodeTool runs. A local install or the
 * desktop app saves it as a download and opens a pre-filled GitHub issue, so
 * no server holds a reporter's prompts. The hosted app sends the report to
 * its own backend (`bugReports.submit`), so a reporter needs no GitHub account.
 */
import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { MAX_BUG_REPORT_BUNDLE_BYTES } from "@nodetool-ai/protocol/api-schemas/bug-reports.js";
import {
  AlertBanner,
  Caption,
  Checkbox,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  SectionHeader,
  Text,
  TextInput,
  UploadButton,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useLogsStore from "../../stores/LogStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  failuresForRun,
  useProviderCallFailureStore
} from "../../stores/ProviderCallFailureStore";
import { formatProviderCallFailures } from "../../utils/providerCallReport";
import { getConsoleEntries, formatConsoleEntries } from "../../utils/consoleCapture";
import { getSystemInfo } from "../../utils/systemInfo";
import { trpcClient } from "../../trpc/client";
import { isElectron, isProduction } from "../../lib/env";
import {
  buildBundleSections,
  buildBundleReadme,
  buildServerErrorSection,
  buildIssueBody,
  buildIssueTitle,
  buildIssueUrl,
  bundleFileName,
  bytesToBase64,
  zipBundle,
  zipBundleBytes,
  type BugReportContext,
  type BundleFile,
  type BundleSection
} from "../../utils/bugReportBundle";

const GITHUB_ISSUE_URL = "https://github.com/nodetool-ai/nodetool/issues/new";

/** The hosted app files reports with its backend instead of on GitHub. */
const SUBMIT_TO_BACKEND = isProduction && !isElectron;

/** How far back the "Recent server errors" section looks. */
const SERVER_ERROR_WINDOW_MS = 60 * 60 * 1000;

/** Cap on a single user-attached file. GitHub refuses more than 25 MB anyway. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function formatBytes(byteLength: number, locale: string): string {
  if (byteLength < 1024) {
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "byte",
      unitDisplay: "narrow",
      maximumFractionDigits: 0
    }).format(byteLength);
  }
  if (byteLength < 1024 * 1024) {
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "kilobyte",
      unitDisplay: "narrow",
      maximumFractionDigits: 0
    }).format(byteLength / 1024);
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "megabyte",
    unitDisplay: "narrow",
    maximumFractionDigits: 1
  }).format(byteLength / (1024 * 1024));
}

function sectionTranslationKey(
  sectionId: string,
  field: "label" | "description"
) {
  switch (sectionId) {
    case "error":
      return field === "label"
        ? "screens4_9.support.bugReport.sections.error.label"
        : "screens4_9.support.bugReport.sections.error.description";
    case "node":
      return field === "label"
        ? "screens4_9.support.bugReport.sections.node.label"
        : "screens4_9.support.bugReport.sections.node.description";
    case "provider-call":
      return field === "label"
        ? "screens4_9.support.bugReport.sections.provider-call.label"
        : "screens4_9.support.bugReport.sections.provider-call.description";
    case "workflow":
      return field === "label"
        ? "screens4_9.support.bugReport.sections.workflow.label"
        : "screens4_9.support.bugReport.sections.workflow.description";
    case "logs":
      return field === "label"
        ? "screens4_9.support.bugReport.sections.logs.label"
        : "screens4_9.support.bugReport.sections.logs.description";
    case "console":
      return field === "label"
        ? "screens4_9.support.bugReport.sections.console.label"
        : "screens4_9.support.bugReport.sections.console.description";
    case "notifications":
      return field === "label"
        ? "screens4_9.support.bugReport.sections.notifications.label"
        : "screens4_9.support.bugReport.sections.notifications.description";
    case "server-errors":
      return field === "label"
        ? "screens4_9.support.bugReport.sections.server-errors.label"
        : "screens4_9.support.bugReport.sections.server-errors.description";
    default:
      return undefined;
  }
}

interface BugReportDialogProps {
  context: BugReportContext;
  onClose: () => void;
}

const BugReportDialog = ({ context, onClose }: BugReportDialogProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [attachments, setAttachments] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  /** Set once the zip is on disk. Its presence is what switches to step 2. */
  const [saved, setSaved] = useState<{
    zipName: string;
    issueUrl: string;
  } | null>(null);
  /** Set once the backend has the report. */
  const [sent, setSent] = useState(false);

  const getCurrentWorkflow = useWorkflowManager(
    (state) => state.getCurrentWorkflow
  );
  const logs = useLogsStore((state) => state.logs);
  const providerFailures = useProviderCallFailureStore(
    (state) => state.failures
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const [systemInfo] = useState(getSystemInfo);

  // Snapshotted when the dialog opens: the reporter consents to what the
  // preview shows, not to whatever the app logs while the form is open.
  const [sections] = useState<BundleSection[]>(() => {
    const workflow = getCurrentWorkflow();
    const relevantLogs = context.workflowId
      ? logs.filter((log) => log.workflowId === context.workflowId)
      : logs;
    const logText = relevantLogs
      .map(
        (log) =>
          `${new Date(log.timestamp).toISOString()} [${log.severity.toUpperCase()}] ${log.nodeName}: ${log.content}`
      )
      .join("\n");
    const consoleEntries = getConsoleEntries();
    const consoleText =
      consoleEntries.length > 0 ? formatConsoleEntries(consoleEntries) : undefined;

    // A surface that knows the failed call passes it in. One that only knows
    // the run — a node error, a failed job — gets the calls that run made,
    // so every report names the provider, model and status without the
    // reporter digging them out.
    const runFailures = failuresForRun(providerFailures, {
      jobId: context.jobId,
      workflowId: context.workflowId
    });
    const providerCallDetail =
      context.providerCallDetail ??
      (runFailures.length > 0
        ? formatProviderCallFailures(runFailures)
        : undefined);

    return buildBundleSections({
      context,
      systemInfo,
      workflow,
      nodeDetail: context.nodeDetail,
      providerCallDetail,
      logText: logText || undefined,
      consoleText
    });
  });

  // The server's own record of what failed around now. Each trace was
  // redacted before it was stored; the section still shows in the preview so
  // the reporter can read and untick it.
  const [traceWindowStart] = useState(() =>
    new Date(Date.now() - SERVER_ERROR_WINDOW_MS).toISOString()
  );
  const { data: serverErrors } = useQuery({
    queryKey: ["error-traces", "report", traceWindowStart],
    queryFn: () =>
      trpcClient.errorTraces.report.query({
        since: traceWindowStart,
        limit: 10
      }),
    refetchOnWindowFocus: false,
    retry: false
  });

  const allSections = useMemo(
    () =>
      serverErrors && serverErrors.trace_ids.length > 0
        ? [...sections, buildServerErrorSection(serverErrors.markdown)]
        : sections,
    [sections, serverErrors]
  );

  const isIncluded = useCallback(
    (section: BundleSection) =>
      excluded[section.id] === undefined
        ? section.defaultIncluded
        : !excluded[section.id],
    [excluded]
  );

  const toggleSection = useCallback((section: BundleSection) => {
    setExcluded((prev) => ({
      ...prev,
      [section.id]:
        prev[section.id] === undefined ? section.defaultIncluded : !prev[section.id]
    }));
  }, []);

  const handleAttach = useCallback(
    (picked: File[]) => {
      const tooBig = picked.filter((file) => file.size > MAX_ATTACHMENT_BYTES);
      if (tooBig.length > 0) {
        addNotification({
          type: "warning",
          content: t("screens4_9.support.bugReport.skippedAttachments", {
            count: tooBig.length,
            size: formatBytes(MAX_ATTACHMENT_BYTES, locale)
          }),
          alert: true
        });
      }
      setAttachments((prev) => [
        ...prev,
        ...picked.filter((file) => file.size <= MAX_ATTACHMENT_BYTES)
      ]);
    },
    [addNotification, locale, t]
  );

  const removeAttachment = useCallback((name: string) => {
    setAttachments((prev) => prev.filter((file) => file.name !== name));
  }, []);

  const handleSaveBundle = useCallback(async () => {
    setBusy(true);
    try {
      const included = allSections.filter(isIncluded);
      const fields = { description, steps, expected };
      const bundleFileNames = [
        "report.md",
        "system.txt",
        ...included.map((section) => section.fileName),
        ...attachments.map((file) => `attachments/${file.name}`)
      ];

      const readme = buildBundleReadme({
        ...fields,
        context,
        systemInfo,
        bundleFileNames
      });
      const files: BundleFile[] = [
        { name: "report.md", content: readme },
        { name: "system.txt", content: systemInfo },
        ...included.map((section) => ({
          name: section.fileName,
          content: section.content
        }))
      ];

      for (const file of attachments) {
        files.push({
          name: `attachments/${file.name}`,
          content: new Uint8Array(await file.arrayBuffer())
        });
      }

      if (SUBMIT_TO_BACKEND) {
        const zipped = zipBundleBytes(files);
        if (zipped.length > MAX_BUG_REPORT_BUNDLE_BYTES) {
          throw new Error(
            t("screens4_9.support.bugReport.bundleTooLarge", {
              size: formatBytes(MAX_BUG_REPORT_BUNDLE_BYTES, locale)
            })
          );
        }
        await trpcClient.bugReports.submit.mutate({
          source: context.source,
          title: buildIssueTitle(context, description),
          description,
          steps: steps || undefined,
          expected: expected || undefined,
          body: readme,
          bundle_base64: bytesToBase64(zipped)
        });
        setSent(true);
        return;
      }

      const zipName = bundleFileName(context, new Date());
      const blob = zipBundle(files);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = zipName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      // The issue opens on the next click, not here: a download and a
      // window.open in one gesture is what popup blockers stop.
      setSaved({
        zipName,
        issueUrl: buildIssueUrl(
          GITHUB_ISSUE_URL,
          buildIssueBody({
            ...fields,
            context,
            systemInfo,
            bundleFileNames,
            bundleFileName: zipName
          }),
          buildIssueTitle(context, description)
        )
      });
    } catch (error) {
      addNotification({
        type: "error",
        content: t("screens4_9.support.bugReport.saveFailed", {
          action: t(
            SUBMIT_TO_BACKEND
              ? "screens4_9.support.bugReport.sendAction"
              : "screens4_9.support.bugReport.saveAction"
          ),
          error: error instanceof Error ? error.message : String(error)
        }),
        alert: true
      });
    } finally {
      setBusy(false);
    }
  }, [
    allSections,
    isIncluded,
    description,
    steps,
    expected,
    attachments,
    context,
    systemInfo,
    addNotification,
    locale,
    t
  ]);

  const handleOpenIssue = useCallback(() => {
    if (!saved) return;
    window.open(saved.issueUrl, "_blank", "noopener,noreferrer");
    onClose();
  }, [saved, onClose]);

  if (sent) {
    return (
      <Dialog
        className="bug-report-dialog"
        open
        onClose={onClose}
        title={t("screens4_9.support.bugReport.reportSentTitle")}
        maxWidth="sm"
        fullWidth
      >
        <AlertBanner severity="success">
          {t("screens4_9.support.bugReport.reportSentMessage")}
        </AlertBanner>
      </Dialog>
    );
  }

  if (saved) {
    return (
      <Dialog
        className="bug-report-dialog"
        open
        onClose={onClose}
        title={t("screens4_9.support.bugReport.reportSavedTitle")}
        maxWidth="sm"
        fullWidth
        onConfirm={handleOpenIssue}
        confirmText={t("screens4_9.support.bugReport.openGitHubIssue")}
        cancelText={t("screens4_9.support.bugReport.later")}
      >
        <FlexColumn gap={SPACING.lg}>
          <AlertBanner severity="success">
            {t("screens4_9.support.bugReport.savedToDownloads", {
              fileName: saved.zipName
            })}
          </AlertBanner>
          <Text>
            {t("screens4_9.support.bugReport.openIssueInstructions")}
          </Text>
        </FlexColumn>
      </Dialog>
    );
  }

  return (
    <Dialog
      className="bug-report-dialog"
      open
      onClose={onClose}
      title={t("screens4_9.support.bugReport.title")}
      maxWidth="md"
      fullWidth
      onConfirm={() => void handleSaveBundle()}
      confirmText={t(
        SUBMIT_TO_BACKEND
          ? "screens4_9.support.bugReport.sendReport"
          : "screens4_9.support.bugReport.saveReportBundle"
      )}
      confirmDisabled={description.trim() === ""}
      isLoading={busy}
    >
      <FlexColumn gap={SPACING.lg}>
        <AlertBanner severity="info">
          {SUBMIT_TO_BACKEND
            ? t("screens4_9.support.bugReport.hostedPrivacyNotice")
            : t("screens4_9.support.bugReport.localPrivacyNotice")}
        </AlertBanner>

        <Caption>
          {t("screens4_9.support.bugReport.reportedFrom", {
            source: t(`screens4_9.support.bugReport.sources.${context.source}`)
          })}
        </Caption>

        <TextInput
          label={t("screens4_9.support.bugReport.descriptionLabel")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          multiline
          minRows={3}
          fullWidth
          autoFocus
          placeholder={t("screens4_9.support.bugReport.descriptionPlaceholder")}
        />
        <TextInput
          label={t("screens4_9.support.bugReport.stepsLabel")}
          value={steps}
          onChange={(event) => setSteps(event.target.value)}
          multiline
          minRows={3}
          fullWidth
          placeholder={t("screens4_9.support.bugReport.stepsPlaceholder")}
        />
        <TextInput
          label={t("screens4_9.support.bugReport.expectedLabel")}
          value={expected}
          onChange={(event) => setExpected(event.target.value)}
          multiline
          minRows={2}
          fullWidth
        />

        <FlexColumn gap={SPACING.sm}>
          <SectionHeader
            size="small"
            title={t("screens4_9.support.bugReport.attachedDataTitle")}
            subtitle={t("screens4_9.support.bugReport.attachedDataDescription")}
          />

          {allSections.length === 0 ? (
            <Caption>
              {t("screens4_9.support.bugReport.noCapturedData")}
            </Caption>
          ) : (
            allSections.map((section) => {
              const labelKey = sectionTranslationKey(section.id, "label");
              const descriptionKey = sectionTranslationKey(
                section.id,
                "description"
              );
              const sectionLabel = labelKey ? t(labelKey) : section.label;
              return (
                <FlexColumn
                  key={section.id}
                  gap={SPACING.xs}
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: BORDER_RADIUS.md,
                    p: SPACING.md
                  }}
                >
                  <FlexRow
                    align="center"
                    justify="space-between"
                    gap={SPACING.sm}
                  >
                    <Checkbox
                      size="small"
                      checked={isIncluded(section)}
                      onChange={() => toggleSection(section)}
                      label={
                        <FlexColumn gap={0}>
                          <Text size="small">{sectionLabel}</Text>
                          <Caption>
                            {descriptionKey
                              ? t(descriptionKey)
                              : section.description}
                          </Caption>
                        </FlexColumn>
                      }
                    />
                    <FlexRow align="center" gap={SPACING.sm}>
                      <Caption>
                        {formatBytes(section.content.length, locale)}
                      </Caption>
                      <EditorButton
                        variant="text"
                        aria-label={t(
                          revealed[section.id]
                            ? "screens4_9.support.bugReport.hideSection"
                            : "screens4_9.support.bugReport.viewSection",
                          { section: sectionLabel }
                        )}
                        onClick={() =>
                          setRevealed((prev) => ({
                            ...prev,
                            [section.id]: !prev[section.id]
                          }))
                        }
                      >
                        {t(
                          revealed[section.id]
                            ? "screens4_9.support.bugReport.hide"
                            : "screens4_9.support.bugReport.view"
                        )}
                      </EditorButton>
                    </FlexRow>
                  </FlexRow>
                  {revealed[section.id] ? (
                    <Text
                      component="pre"
                      size="small"
                      family="secondary"
                      sx={{
                        m: 0,
                        p: SPACING.xs,
                        maxHeight: 220,
                        overflow: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        bgcolor: "background.default",
                        borderRadius: BORDER_RADIUS.sm
                      }}
                    >
                      {section.content}
                    </Text>
                  ) : null}
                </FlexColumn>
              );
            })
          )}
        </FlexColumn>

        <FlexColumn gap={SPACING.sm}>
          <SectionHeader
            size="small"
            title={t("screens4_9.support.bugReport.attachmentsTitle")}
            subtitle={t("screens4_9.support.bugReport.attachmentsDescription")}
          />
          <UploadButton
            label={t("screens4_9.support.bugReport.addFiles")}
            tooltip={t("screens4_9.support.bugReport.addFilesTooltip")}
            iconVariant="file"
            nodrag={false}
            onFileSelect={handleAttach}
            sx={{ alignSelf: "flex-start" }}
          />
          {attachments.map((file) => (
            <FlexRow key={file.name} align="center" gap={SPACING.sm}>
              <Caption>
                {file.name} ({formatBytes(file.size, locale)})
              </Caption>
              <EditorButton
                variant="text"
                aria-label={t(
                  "screens4_9.support.bugReport.removeAttachmentLabel",
                  { fileName: file.name }
                )}
                onClick={() => removeAttachment(file.name)}
              >
                {t("screens4_9.support.bugReport.removeAttachment")}
              </EditorButton>
            </FlexRow>
          ))}
        </FlexColumn>
      </FlexColumn>
    </Dialog>
  );
};

export default memo(BugReportDialog);
