/**
 * Save As dialog for documents (document editor PRD R18, R19): lets the user
 * pick an output format (.md, .txt, .pdf, .html, or Google Doc), edit the
 * filename, and choose a destination folder inside the project.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";

import { trpcClient } from "../../trpc/client";
import { isReservedProjectEntry } from "../workspaces/projectFolderPaths";
import {
  AlertBanner,
  Caption,
  Card,
  Dialog,
  FlexColumn,
  FlexRow,
  GAP,
  LoadingSpinner,
  PADDING,
  ScrollArea,
  SelectField,
  SelectableListItem,
  Text,
  TextInput,
  ToolbarIconButton,
  type SelectOption
} from "../ui_primitives";
import { splitDocumentFilename } from "./DocumentTitleHeader";

export type SaveAsFormat = "md" | "txt" | "pdf" | "html" | "google_doc";

export interface DocumentSaveAsDialogProps {
  open: boolean;
  onClose: () => void;
  defaultName: string;
  defaultDirectory: string;
  workspaceId: string | null;
  saving: boolean;
  onSaveAs: (args: {
    format: SaveAsFormat;
    directory: string;
    name: string;
  }) => Promise<void>;
}

interface FolderEntry {
  name: string;
  path: string;
}

const FORMAT_EXTENSION: Record<Exclude<SaveAsFormat, "google_doc">, string> = {
  md: ".md",
  txt: ".txt",
  pdf: ".pdf",
  html: ".html"
};

function normalizeDirectory(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
  if (trimmed === "" || trimmed === ".") {
    return ".";
  }
  return trimmed;
}

function parentDirectory(path: string): string {
  const normalized = normalizeDirectory(path);
  if (normalized === ".") {
    return ".";
  }
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "." : normalized.slice(0, index);
}

function previewFilename(name: string, format: SaveAsFormat): string {
  const trimmed = name.trim();
  if (trimmed === "" || format === "google_doc") {
    return trimmed;
  }
  const extension = FORMAT_EXTENSION[format];
  return trimmed.toLowerCase().endsWith(extension)
    ? trimmed
    : `${trimmed}${extension}`;
}

export const DocumentSaveAsDialog = ({
  open,
  onClose,
  defaultName,
  defaultDirectory,
  workspaceId,
  saving,
  onSaveAs
}: DocumentSaveAsDialogProps) => {
  const { t } = useTranslation();
  const [format, setFormat] = useState<SaveAsFormat>("md");
  const [name, setName] = useState("");
  const [directory, setDirectory] = useState(".");
  const [browsePath, setBrowsePath] = useState(".");
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setFormat("md");
    setName(splitDocumentFilename(defaultName).stem);
    setDirectory(normalizeDirectory(defaultDirectory));
    setBrowsePath(".");
    setSubmitError(null);
  }, [defaultDirectory, defaultName, open]);

  useEffect(() => {
    if (!open || !workspaceId || format === "google_doc") {
      setFolders([]);
      setLoadingFolders(false);
      return;
    }
    let cancelled = false;
    setLoadingFolders(true);
    void trpcClient.workspace.listFiles
      .query({ id: workspaceId, path: browsePath })
      .then((entries) => {
        if (cancelled) {
          return;
        }
        const nextFolders = entries
          .filter((entry) => entry.is_dir && !isReservedProjectEntry(entry))
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, {
              numeric: true,
              sensitivity: "base"
            })
          )
          .map((entry) => ({ name: entry.name, path: entry.path }));
        setFolders(nextFolders);
      })
      .catch(() => {
        if (!cancelled) {
          setFolders([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingFolders(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [browsePath, format, open, workspaceId]);

  const formatOptions: SelectOption[] = useMemo(
    () => [
      {
        value: "md",
        label: t("documentEditor.saveAs.formats.md", "Markdown (.md)")
      },
      {
        value: "txt",
        label: t("documentEditor.saveAs.formats.txt", "Plain text (.txt)")
      },
      {
        value: "pdf",
        label: t("documentEditor.saveAs.formats.pdf", "PDF (.pdf)")
      },
      {
        value: "html",
        label: t("documentEditor.saveAs.formats.html", "HTML (.html)")
      },
      {
        value: "google_doc",
        label: t("documentEditor.saveAs.formats.googleDoc", "Google Doc")
      }
    ],
    [t]
  );

  const trimmedName = name.trim();
  const isGoogleDoc = format === "google_doc";
  const outputPreview = previewFilename(trimmedName, format);

  const handleConfirm = useCallback(async () => {
    if (trimmedName === "" || saving) {
      return;
    }
    setSubmitError(null);
    try {
      await onSaveAs({
        format,
        directory: isGoogleDoc ? "" : normalizeDirectory(directory),
        name: trimmedName
      });
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : t("documentEditor.saveAs.error", "Could not save the document.")
      );
    }
  }, [directory, format, isGoogleDoc, onClose, onSaveAs, saving, t, trimmedName]);

  const goUp = () => {
    const parent = parentDirectory(browsePath);
    setBrowsePath(parent);
    setDirectory(parent);
  };

  const openFolder = (folderPath: string) => {
    const normalized = normalizeDirectory(folderPath);
    setBrowsePath(normalized);
    setDirectory(normalized);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("documentEditor.saveAs.title", "Save as")}
      onConfirm={() => void handleConfirm()}
      confirmText={t("documentEditor.saveAs.confirm", "Save")}
      cancelText={t("common.cancel", "Cancel")}
      confirmDisabled={trimmedName === "" || saving}
      isLoading={saving}
    >
      <FlexColumn gap={GAP.comfortable}>
        <SelectField
          label={t("documentEditor.saveAs.format", "Format")}
          value={format}
          onChange={(next) => {
            setFormat(next as SaveAsFormat);
            setSubmitError(null);
          }}
          options={formatOptions}
          disabled={saving}
        />
        <TextInput
          autoFocus
          label={t("documentEditor.saveAs.filename", "Filename")}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setSubmitError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleConfirm();
            }
          }}
          helperText={
            outputPreview && !isGoogleDoc
              ? t("documentEditor.saveAs.outputPreview", {
                  file: outputPreview,
                  defaultValue: "Saves as {{file}}"
                })
              : undefined
          }
          disabled={saving}
        />
        {!isGoogleDoc && (
          <FlexColumn gap={GAP.normal}>
            <TextInput
              label={t("documentEditor.saveAs.folder", "Destination folder")}
              value={directory}
              onChange={(event) => {
                setDirectory(event.target.value);
                setSubmitError(null);
              }}
              placeholder="."
              disabled={saving}
            />
            {workspaceId && (
              <Card variant="outlined" padding="none">
                <FlexRow
                  align="center"
                  justify="space-between"
                  gap={GAP.tight}
                  sx={{
                    padding: PADDING.compact,
                    borderBottom: 1,
                    borderColor: "divider"
                  }}
                >
                  <FlexRow align="center" gap={GAP.tight} sx={{ minWidth: 0 }}>
                    <ToolbarIconButton
                      icon={<ArrowUpwardIcon fontSize="small" />}
                      tooltip={t(
                        "documentEditor.saveAs.parentFolder",
                        "Parent folder"
                      )}
                      disabled={browsePath === "." || saving}
                      onClick={goUp}
                    />
                    <Text size="small" color="secondary" truncate>
                      {browsePath === "."
                        ? t("documentEditor.saveAs.projectRoot", "Project root")
                        : browsePath}
                    </Text>
                  </FlexRow>
                  {browsePath !== "." && (
                    <Caption color="secondary">{browsePath}</Caption>
                  )}
                </FlexRow>
                <ScrollArea thin maxHeight={180}>
                  {loadingFolders ? (
                    <FlexRow
                      justify="center"
                      sx={{ padding: PADDING.comfortable }}
                    >
                      <LoadingSpinner size="small" />
                    </FlexRow>
                  ) : folders.length === 0 ? (
                    <FlexRow
                      justify="center"
                      sx={{ padding: PADDING.comfortable }}
                    >
                      <Caption color="secondary">
                        {t("documentEditor.saveAs.noSubfolders", "No subfolders")}
                      </Caption>
                    </FlexRow>
                  ) : (
                    <FlexColumn>
                      {folders.map((folder) => {
                        const selected =
                          normalizeDirectory(directory) ===
                          normalizeDirectory(folder.path);
                        return (
                          <SelectableListItem
                            key={folder.path}
                            selected={selected}
                            disabled={saving}
                            onClick={() =>
                              setDirectory(normalizeDirectory(folder.path))
                            }
                            onDoubleClick={() => openFolder(folder.path)}
                          >
                            <FolderOutlinedIcon fontSize="small" />
                            <Text size="small" sx={{ flex: 1, minWidth: 0 }} truncate>
                              {folder.name}
                            </Text>
                            <ToolbarIconButton
                              icon={<ChevronRightIcon fontSize="small" />}
                              tooltip={t(
                                "documentEditor.saveAs.openFolder",
                                "Open folder"
                              )}
                              disabled={saving}
                              onClick={(event) => {
                                event.stopPropagation();
                                openFolder(folder.path);
                              }}
                            />
                          </SelectableListItem>
                        );
                      })}
                    </FlexColumn>
                  )}
                </ScrollArea>
              </Card>
            )}
          </FlexColumn>
        )}
        {submitError && (
          <AlertBanner severity="error">{submitError}</AlertBanner>
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default DocumentSaveAsDialog;
