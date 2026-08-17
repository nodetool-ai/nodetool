/**
 * The bug-report form. Collects what happened, shows exactly which data will
 * leave the machine, and saves a zip the reporter attaches to a GitHub issue.
 *
 * Nothing is uploaded. The bundle is a local download, and the issue is the
 * normal pre-filled GitHub URL — so no server holds a reporter's prompts.
 */
import { memo, useCallback, useState } from "react";
import {
  AlertBanner,
  Caption,
  Checkbox,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text,
  TextField,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useLogsStore from "../../stores/LogStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { getConsoleEntries, formatConsoleEntries } from "../../utils/consoleCapture";
import { getSystemInfo } from "../../utils/systemInfo";
import {
  buildBundleSections,
  buildBundleReadme,
  buildIssueBody,
  buildIssueTitle,
  buildIssueUrl,
  bundleFileName,
  sourceLabel,
  zipBundle,
  type BugReportContext,
  type BundleFile,
  type BundleSection
} from "../../utils/bugReportBundle";

const GITHUB_ISSUE_URL = "https://github.com/nodetool-ai/nodetool/issues/new";

/** Cap on a single user-attached file. GitHub refuses more than 25 MB anyway. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function formatBytes(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`;
  if (byteLength < 1024 * 1024) return `${Math.round(byteLength / 1024)} KB`;
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

interface BugReportDialogProps {
  context: BugReportContext;
  onClose: () => void;
}

const BugReportDialog = ({ context, onClose }: BugReportDialogProps) => {
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

  const getCurrentWorkflow = useWorkflowManager(
    (state) => state.getCurrentWorkflow
  );
  const logs = useLogsStore((state) => state.logs);
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

    return buildBundleSections({
      context,
      systemInfo,
      workflow,
      nodeDetail: context.nodeDetail,
      logText: logText || undefined,
      consoleText
    });
  });

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
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []);
      const tooBig = picked.filter((file) => file.size > MAX_ATTACHMENT_BYTES);
      if (tooBig.length > 0) {
        addNotification({
          type: "warning",
          content: `Skipped ${tooBig.length} file(s) over ${formatBytes(MAX_ATTACHMENT_BYTES)}`,
          alert: true
        });
      }
      setAttachments((prev) => [
        ...prev,
        ...picked.filter((file) => file.size <= MAX_ATTACHMENT_BYTES)
      ]);
      event.target.value = "";
    },
    [addNotification]
  );

  const removeAttachment = useCallback((name: string) => {
    setAttachments((prev) => prev.filter((file) => file.name !== name));
  }, []);

  const handleSaveBundle = useCallback(async () => {
    setBusy(true);
    try {
      const included = sections.filter(isIncluded);
      const fields = { description, steps, expected };
      const bundleFileNames = [
        "report.md",
        "system.txt",
        ...included.map((section) => section.fileName),
        ...attachments.map((file) => `attachments/${file.name}`)
      ];

      const files: BundleFile[] = [
        {
          name: "report.md",
          content: buildBundleReadme({
            ...fields,
            context,
            systemInfo,
            bundleFileNames
          })
        },
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
        content: `Could not build the report: ${
          error instanceof Error ? error.message : String(error)
        }`,
        alert: true
      });
    } finally {
      setBusy(false);
    }
  }, [
    sections,
    isIncluded,
    description,
    steps,
    expected,
    attachments,
    context,
    systemInfo,
    addNotification
  ]);

  const handleOpenIssue = useCallback(() => {
    if (!saved) return;
    window.open(saved.issueUrl, "_blank", "noopener,noreferrer");
    onClose();
  }, [saved, onClose]);

  if (saved) {
    return (
      <Dialog
        className="bug-report-dialog"
        open
        onClose={onClose}
        title="Report saved"
        maxWidth="sm"
        fullWidth
      >
        <FlexColumn gap={SPACING.lg} sx={{ pb: 2 }}>
          <AlertBanner severity="success">
            Saved <strong>{saved.zipName}</strong> to your downloads.
          </AlertBanner>
          <Text>
            Now open the GitHub issue. It is pre-filled with your description.
            Drag the saved zip into it before you submit.
          </Text>
          <FlexRow justify="flex-end" gap={SPACING.sm}>
            <EditorButton variant="outlined" onClick={onClose}>
              Later
            </EditorButton>
            <EditorButton variant="contained" onClick={handleOpenIssue}>
              Open GitHub issue
            </EditorButton>
          </FlexRow>
        </FlexColumn>
      </Dialog>
    );
  }

  return (
    <Dialog
      className="bug-report-dialog"
      open
      onClose={onClose}
      title="Report a Bug"
      maxWidth="md"
      fullWidth
    >
      <FlexColumn gap={SPACING.lg} sx={{ pb: 2 }}>
        <AlertBanner severity="info">
          Nothing is uploaded. NodeTool saves a zip to your downloads. You then
          open a pre-filled GitHub issue and attach the zip there. Review what it
          contains below.
        </AlertBanner>

        <Caption>Reported from: {sourceLabel(context.source)}</Caption>

        <TextField
          label="What went wrong?"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          multiline
          minRows={3}
          fullWidth
          autoFocus
          placeholder="Describe the problem in a sentence or two."
        />
        <TextField
          label="Steps to reproduce"
          value={steps}
          onChange={(event) => setSteps(event.target.value)}
          multiline
          minRows={3}
          fullWidth
          placeholder={"1. Open …\n2. Add a … node\n3. Run the workflow"}
        />
        <TextField
          label="What did you expect?"
          value={expected}
          onChange={(event) => setExpected(event.target.value)}
          multiline
          minRows={2}
          fullWidth
        />

        <FlexColumn gap={SPACING.sm}>
          <Text weight={600}>Attached data</Text>
          <Caption>
            API keys and inlined media are removed before the file is written.
            Open any file to read it first.
          </Caption>

          {sections.length === 0 ? (
            <Caption>Nothing was captured to attach to this report.</Caption>
          ) : (
            sections.map((section) => (
              <FlexColumn
                key={section.id}
                gap={SPACING.xs}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: BORDER_RADIUS.md,
                  p: 2
                }}
              >
                <FlexRow align="center" justify="space-between" gap={SPACING.sm}>
                  <Checkbox
                    size="small"
                    checked={isIncluded(section)}
                    onChange={() => toggleSection(section)}
                    label={
                      <FlexColumn gap={0}>
                        <Text size="small">{section.label}</Text>
                        <Caption>{section.description}</Caption>
                      </FlexColumn>
                    }
                  />
                  <FlexRow align="center" gap={SPACING.sm}>
                    <Caption>{formatBytes(section.content.length)}</Caption>
                    <EditorButton
                      variant="text"
                      aria-label={`${revealed[section.id] ? "Hide" : "View"} ${section.label}`}
                      onClick={() =>
                        setRevealed((prev) => ({
                          ...prev,
                          [section.id]: !prev[section.id]
                        }))
                      }
                    >
                      {revealed[section.id] ? "Hide" : "View"}
                    </EditorButton>
                  </FlexRow>
                </FlexRow>
                {revealed[section.id] ? (
                  <Text
                    component="pre"
                    size="small"
                    sx={{
                      m: 0,
                      p: 1,
                      maxHeight: 220,
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: "monospace",
                      bgcolor: "background.default",
                      borderRadius: BORDER_RADIUS.sm
                    }}
                  >
                    {section.content}
                  </Text>
                ) : null}
              </FlexColumn>
            ))
          )}
        </FlexColumn>

        <FlexColumn gap={SPACING.sm}>
          <Text weight={600}>Screenshots and other files</Text>
          <Caption>
            A screenshot of the broken screen is the most useful thing you can
            add.
          </Caption>
          <label>
            <input
              type="file"
              multiple
              onChange={handleAttach}
              style={{ display: "block" }}
              aria-label="Attach files to the bug report"
            />
          </label>
          {attachments.map((file) => (
            <FlexRow key={file.name} align="center" gap={SPACING.sm}>
              <Caption>
                {file.name} ({formatBytes(file.size)})
              </Caption>
              <EditorButton
                variant="text"
                onClick={() => removeAttachment(file.name)}
              >
                Remove
              </EditorButton>
            </FlexRow>
          ))}
        </FlexColumn>

        <FlexRow justify="flex-end" gap={SPACING.sm}>
          <EditorButton variant="outlined" onClick={onClose} disabled={busy}>
            Cancel
          </EditorButton>
          <EditorButton
            variant="contained"
            onClick={() => void handleSaveBundle()}
            disabled={busy || description.trim() === ""}
          >
            {busy ? "Saving…" : "Save report bundle"}
          </EditorButton>
        </FlexRow>
      </FlexColumn>
    </Dialog>
  );
};

export default memo(BugReportDialog);
