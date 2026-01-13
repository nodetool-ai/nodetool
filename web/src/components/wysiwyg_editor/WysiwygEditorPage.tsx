/**
 * WYSIWYG Editor Page
 *
 * Standalone page for the WYSIWYG editor with state management.
 */

import React, { useState, useCallback } from "react";
import { Box, Button, Stack, Typography, Paper, Snackbar, Alert } from "@mui/material";
import { Save as SaveIcon, FolderOpen as OpenIcon, Add as NewIcon } from "@mui/icons-material";
import { WysiwygEditor } from "./WysiwygEditor";
import type { UISchema } from "./types";
import { createEmptySchema } from "./utils/schemaUtils";

/**
 * WYSIWYG Editor Page Component
 */
export const WysiwygEditorPage: React.FC = () => {
  const [schema, setSchema] = useState<UISchema>(createEmptySchema);
  const [notification, setNotification] = useState<{ message: string; severity: "success" | "error" | "info" } | null>(
    null
  );

  // Handle schema changes
  const handleChange = useCallback((newSchema: UISchema) => {
    setSchema(newSchema);
  }, []);

  // Create new schema
  const handleNew = useCallback(() => {
    setSchema(createEmptySchema());
    setNotification({ message: "Created new layout", severity: "info" });
  }, []);

  // Save schema to clipboard
  const handleSave = useCallback(async () => {
    try {
      const json = JSON.stringify(schema, null, 2);
      await navigator.clipboard.writeText(json);
      setNotification({ message: "Schema copied to clipboard!", severity: "success" });
    } catch (_error) {
      setNotification({ message: "Failed to copy schema", severity: "error" });
    }
  }, [schema]);

  // Load schema from clipboard
  const handleLoad = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text) as UISchema;
      if (parsed.root && parsed.version) {
        setSchema(parsed);
        setNotification({ message: "Schema loaded from clipboard!", severity: "success" });
      } else {
        setNotification({ message: "Invalid schema format", severity: "error" });
      }
    } catch (_error) {
      setNotification({ message: "Failed to load schema from clipboard", severity: "error" });
    }
  }, []);

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          MUI WYSIWYG Editor
        </Typography>

        <Stack direction="row" spacing={1}>
          <Button startIcon={<NewIcon />} onClick={handleNew} size="small" variant="outlined">
            New
          </Button>
          <Button startIcon={<OpenIcon />} onClick={handleLoad} size="small" variant="outlined">
            Load
          </Button>
          <Button startIcon={<SaveIcon />} onClick={handleSave} size="small" variant="contained">
            Save
          </Button>
        </Stack>
      </Paper>

      {/* Editor */}
      <Box sx={{ flex: 1, overflow: "hidden" }}>
        <WysiwygEditor value={schema} onChange={handleChange} />
      </Box>

      {/* Notification */}
      <Snackbar
        open={notification !== null}
        autoHideDuration={3000}
        onClose={() => setNotification(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {notification ? (
          <Alert severity={notification.severity} onClose={() => setNotification(null)}>
            {notification.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
};

export default WysiwygEditorPage;
