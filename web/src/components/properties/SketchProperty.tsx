/**
 * SketchProperty
 *
 * Property widget for the sketch editor type.
 * Displays a thumbnail preview and an "Edit" button that opens the
 * full sketch editor in a modal.
 *
 * The property value is the serialized SketchDocument JSON string.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Button, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import isEqual from "lodash/isEqual";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { SketchModal } from "../sketch";
import {
  SketchDocument,
  createDefaultDocument,
  deserializeDocument,
  serializeDocument,
  flattenDocument,
  canvasToDataUrl
} from "../sketch";

const styles = (theme: Theme) =>
  css({
    "& .sketch-preview": {
      width: "100%",
      maxWidth: "200px",
      aspectRatio: "1",
      backgroundColor: theme.vars.palette.grey[800],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: "4px",
      overflow: "hidden",
      cursor: "pointer",
      position: "relative",
      marginBottom: "4px",
      "& img": {
        width: "100%",
        height: "100%",
        objectFit: "contain"
      },
      "&:hover .sketch-preview-overlay": {
        opacity: 1
      }
    },
    "& .sketch-preview-overlay": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.5)",
      opacity: 0,
      transition: "opacity 0.2s"
    }
  });

const SketchProperty = (props: PropertyProps) => {
  const theme = useTheme();
  const id = `sketch-${props.property.name}-${props.propertyIndex}`;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const documentRef = useRef<SketchDocument | null>(null);

  // Parse the current value into a SketchDocument
  const getDocument = useCallback((): SketchDocument => {
    if (documentRef.current) {
      return documentRef.current;
    }
    const parsed = deserializeDocument(
      typeof props.value === "string" ? props.value : null
    );
    const doc = parsed || createDefaultDocument();
    documentRef.current = doc;
    return doc;
  }, [props.value]);

  // Generate preview thumbnail
  useEffect(() => {
    const doc = getDocument();
    // Only generate preview if there are layers with data
    const hasData = doc.layers.some((l) => l.data !== null);
    if (hasData) {
      flattenDocument(doc)
        .then((canvas) => {
          setPreviewUrl(canvasToDataUrl(canvas));
        })
        .catch(() => {
          // Preview generation failed, ignore
        });
    }
  }, [getDocument, props.value]);

  const handleOpenModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    // Persist on close — this is the only place we serialize.
    const doc = documentRef.current;
    if (doc) {
      props.onChange(serializeDocument(doc));
    }
    setIsModalOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.onChange]);

  const handleDocumentChange = useCallback((doc: SketchDocument) => {
    // Keep in-memory ref up to date. No serialization here —
    // persisting on every stroke stalls the main thread.
    // handleCloseModal and handleSave do the actual persist.
    documentRef.current = doc;
  }, []);

  const handleSave = useCallback(
    (_doc: SketchDocument) => {
      const currentDoc = documentRef.current;
      if (currentDoc) {
        const serialized = serializeDocument(currentDoc);
        props.onChange(serialized);
        props.onChangeComplete?.();
      }
    },
    [props]
  );

  return (
    <div css={styles(theme)}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <Box
        className="sketch-preview"
        onClick={handleOpenModal}
        role="button"
        tabIndex={0}
        aria-label={`Edit image: ${props.property.name}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            handleOpenModal();
          }
        }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="Image editor preview" />
        ) : (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "grey.500"
            }}
          >
            <Typography variant="caption">Click to edit</Typography>
          </Box>
        )}
        <Box className="sketch-preview-overlay">
          <EditIcon sx={{ color: "white" }} />
        </Box>
      </Box>
      <Button
        variant="outlined"
        size="small"
        startIcon={<EditIcon />}
        onClick={handleOpenModal}
        fullWidth
        sx={{ textTransform: "none", fontSize: "0.75rem" }}
      >
        Open Editor
      </Button>

      <SketchModal
        open={isModalOpen}
        title={props.property.name || "Image Editor"}
        initialDocument={getDocument()}
        onClose={handleCloseModal}
        onSave={handleSave}
        onDocumentChange={handleDocumentChange}
      />
    </div>
  );
};

export default memo(SketchProperty, isEqual);
