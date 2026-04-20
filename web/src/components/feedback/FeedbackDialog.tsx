import React, { ChangeEvent, memo, useCallback, useMemo, useRef, useState } from "react";
import {
  Caption,
  Checkbox,
  Dialog,
  EditorButton,
  FlexColumn,
  SelectField,
  TextInput,
} from "../ui_primitives";
import { restFetch } from "../../lib/rest-fetch";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

export interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
}

const FEEDBACK_TYPE_OPTIONS = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature" },
];

export const FeedbackDialog: React.FC<FeedbackDialogProps> = memo(
  ({ open, onClose }) => {
    const [username, setUsername] = useState("");
    const [feedbackType, setFeedbackType] = useState("bug");
    const [destination, setDestination] = useState("email");
    const [message, setMessage] = useState("");
    const [includeWorkflowJson, setIncludeWorkflowJson] = useState(false);
    const [clipboardImage, setClipboardImage] = useState<File | null>(null);
    const [logFile, setLogFile] = useState<File | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const currentWorkflowId = useWorkflowManager((state) => state.currentWorkflowId);
    const getNodeStore = useWorkflowManager((state) => state.getNodeStore);

    const helperCopy = useMemo(
      () => ({
        bug: "For bugs, include what happened, what you expected, and how to reproduce it.",
        feature:
          "For features, describe the workflow you want to improve and why it would help."
      }),
      []
    );

    const currentWorkflowJson = useMemo(() => {
      if (!includeWorkflowJson || !currentWorkflowId) {
        return undefined;
      }

      const store = getNodeStore(currentWorkflowId);
      return store?.getState().workflowJSON();
    }, [currentWorkflowId, getNodeStore, includeWorkflowJson]);

    const resetForm = useCallback(() => {
      setUsername("");
      setFeedbackType("bug");
      setDestination("email");
      setMessage("");
      setIncludeWorkflowJson(false);
      setClipboardImage(null);
      setLogFile(null);
      setSubmitError(null);
      setIsSubmitting(false);
    }, []);

    const handleClose = useCallback(() => {
      resetForm();
      onClose();
    }, [onClose, resetForm]);

    const dataUrlToFile = useCallback(
      (
        dataUrl: string,
        filename: string,
        fallbackType: string
      ): File => {
        const match = dataUrl.match(/^data:([^;]+)?;base64,(.+)$/);
        if (!match) {
          throw new Error("Invalid data URL");
        }

        const mimeType = match[1] || fallbackType;
        const base64 = match[2];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }

        return new File([bytes], filename, {
          type: mimeType
        });
      },
      []
    );

    const handlePasteClipboardImage = useCallback(async () => {
      const dataUrl = await window.api?.clipboard?.readImage?.();
      if (!dataUrl || !dataUrl.startsWith("data:image")) {
        return;
      }

      const extension = dataUrl.match(/^data:image\/(\w+);/i)?.[1] ?? "png";
      const file = dataUrlToFile(
        dataUrl,
        `clipboard-image.${extension}`,
        `image/${extension}`
      );
      setClipboardImage(file);
    }, [dataUrlToFile]);

    const handleLogFileSelection = useCallback(
      async (filePath: string) => {
        const dataUrl = await window.api?.clipboard?.readFileAsDataURL?.(filePath);
        if (!dataUrl) {
          return;
        }

        const filename = filePath.split(/[/\\]/).pop() ?? "nodetool.log";
        const file = dataUrlToFile(dataUrl, filename, "text/plain");
        setLogFile(file);
      },
      [dataUrlToFile]
    );

    const handleAttachLogFile = useCallback(async () => {
      if (window.api?.dialog?.openFile) {
        const result = await window.api.dialog.openFile({
          title: "Attach log file",
          filters: [
            { name: "Log Files", extensions: ["log", "txt", "json"] },
            { name: "All Files", extensions: ["*"] }
          ]
        });
        if (!result.canceled && result.filePaths.length > 0) {
          await handleLogFileSelection(result.filePaths[0]);
        }
        return;
      }

      fileInputRef.current?.click();
    }, [handleLogFileSelection]);

    const handleFileInputChange = useCallback(
      async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
          setLogFile(file);
        }
        event.target.value = "";
      },
      []
    );

    const handleSubmit = useCallback(async () => {
      if (!username.trim()) {
        setSubmitError("Username is required.");
        return;
      }
      if (!message.trim()) {
        setSubmitError("Message is required.");
        return;
      }

      setSubmitError(null);
      setIsSubmitting(true);

      try {
        const formData = new FormData();
        formData.set("username", username.trim());
        formData.set("feedbackType", feedbackType);
        formData.set("message", message.trim());
        formData.set("destinations", JSON.stringify([destination]));

        if (currentWorkflowJson) {
          formData.set("workflowJson", currentWorkflowJson);
        }
        if (clipboardImage) {
          formData.append("attachments", clipboardImage);
        }
        if (logFile) {
          formData.append("attachments", logFile);
        }

        const response = await restFetch("/api/feedback", {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          const errorBody = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(errorBody?.error || "Failed to send feedback");
        }

        handleClose();
      } catch (error) {
        setSubmitError(
          error instanceof Error ? error.message : "Failed to send feedback"
        );
      } finally {
        setIsSubmitting(false);
      }
    }, [
      clipboardImage,
      currentWorkflowJson,
      destination,
      feedbackType,
      handleClose,
      logFile,
      message,
      username
    ]);

    return (
      <Dialog
        open={open}
        onClose={() => handleClose()}
        title="Send feedback"
        maxWidth="sm"
        fullWidth
        onConfirm={handleSubmit}
        confirmText="Send"
        confirmDisabled={isSubmitting}
        isLoading={isSubmitting}
      >
        <FlexColumn gap={2}>
          <TextInput
            label="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Your name"
          />
          <SelectField
            label="Type"
            value={feedbackType}
            onChange={setFeedbackType}
            options={FEEDBACK_TYPE_OPTIONS}
          />
          <SelectField
            label="Destination"
            value={destination}
            onChange={setDestination}
            options={[
              { value: "email", label: "Email" },
              { value: "discord", label: "Discord forum" }
            ]}
          />
          <FlexColumn gap={0.5}>
            <Caption>{helperCopy.bug}</Caption>
            <Caption>{helperCopy.feature}</Caption>
          </FlexColumn>
          <Checkbox
            label="Include current workflow JSON"
            checked={includeWorkflowJson}
            onChange={(event) => setIncludeWorkflowJson(event.target.checked)}
          />
          <FlexColumn gap={1}>
            <EditorButton variant="outlined" onClick={handlePasteClipboardImage}>
              Paste clipboard image
            </EditorButton>
            <EditorButton variant="outlined" onClick={handleAttachLogFile}>
              Attach log file
            </EditorButton>
            <input
              ref={fileInputRef}
              type="file"
              accept=".log,.txt,.json,text/plain,application/json"
              hidden
              onChange={handleFileInputChange}
            />
            {clipboardImage ? <Caption>{clipboardImage.name}</Caption> : null}
            {logFile ? <Caption>{logFile.name}</Caption> : null}
          </FlexColumn>
          <TextInput
            label="Message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Tell us what happened or what you would like to see."
            multiline
            rows={5}
          />
          {submitError ? <Caption>{submitError}</Caption> : null}
        </FlexColumn>
      </Dialog>
    );
  }
);

FeedbackDialog.displayName = "FeedbackDialog";
