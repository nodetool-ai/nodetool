/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { CircularProgress, Typography } from "@mui/material";
import { useAssetStore } from "../../stores/AssetStore";
import { useAssetById } from "../../serverState/useAssetById";
import { ImageEditor } from "../node/image_editor";
import log from "loglevel";

const styles = (theme: Theme) =>
    css({
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: theme.vars.palette.grey[900],
        ".loading-container": {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: "16px"
        },
        ".error-container": {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: "16px",
            color: theme.vars.palette.error.main
        }
    });

/**
 * Convert a Blob to a base64 string (without data URL prefix)
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            // Extract just the base64 data (remove "data:image/...;base64," prefix)
            resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

/**
 * AssetEditor - Standalone page for editing asset images
 * Route: /assets/edit/:assetId
 */
const AssetEditor: React.FC = () => {
    const theme = useTheme();
    const { assetId } = useParams<{ assetId: string }>();
    const navigate = useNavigate();

    const updateAsset = useAssetStore((state) => state.update);
    const invalidateQueries = useAssetStore((state) => state.invalidateQueries);

    const [isSaving, setIsSaving] = useState(false);

    // Fetch asset using useQuery
    const { data: asset, isLoading: loading, error: queryError } = useAssetById(assetId);

    // Validate asset type and create error message
    const error = useMemo(() => {
        if (!assetId) {
            return "No asset ID provided";
        }
        if (queryError) {
            log.error("[AssetEditor] Failed to fetch asset:", queryError);
            return "Failed to load asset";
        }
        if (!loading && !asset) {
            return "Asset not found";
        }
        if (asset && !asset.content_type?.startsWith("image/")) {
            return "Asset is not an image";
        }
        return null;
    }, [assetId, asset, loading, queryError]);

    // Handle close - navigate back
    const handleClose = useCallback(() => {
        navigate(-1);
    }, [navigate]);

    // Handle save
    const handleSave = useCallback(
        async (_editedImageUrl: string, blob: Blob) => {
            if (!asset) {
                return;
            }

            setIsSaving(true);

            try {
                log.info(`[AssetEditor] Saving edited image for asset: ${asset.id}`);

                // Convert blob to base64
                const base64Data = await blobToBase64(blob);

                // Update the asset with the new image data
                await updateAsset({
                    id: asset.id,
                    data: base64Data,
                    data_encoding: "base64"
                });

                // Invalidate cache to refresh the asset display
                invalidateQueries(["asset", asset.id]);
                if (asset.parent_id) {
                    invalidateQueries(["assets", { parent_id: asset.parent_id }]);
                }

                log.info(
                    `[AssetEditor] Successfully saved edited image for asset: ${asset.id}`
                );

                // Navigate back after successful save
                navigate(-1);
            } catch (err) {
                log.error("[AssetEditor] Failed to save edited image:", err);
                // Keep the editor open on error
            } finally {
                setIsSaving(false);
            }
        },
        [asset, updateAsset, invalidateQueries, navigate]
    );

    // Loading state
    if (loading) {
        return (
            <div css={styles(theme)}>
                <div className="loading-container">
                    <CircularProgress />
                    <Typography>Loading asset...</Typography>
                </div>
            </div>
        );
    }

    // Error state
    if (error || !asset) {
        return (
            <div css={styles(theme)}>
                <div className="error-container">
                    <Typography variant="h6">{error || "Unknown error"}</Typography>
                    <Typography
                        variant="body2"
                        sx={{ cursor: "pointer", textDecoration: "underline" }}
                        onClick={handleClose}
                    >
                        Go back
                    </Typography>
                </div>
            </div>
        );
    }

    // Render editor
    return (
        <div css={styles(theme)}>
            {asset.get_url && (
                <ImageEditor
                    imageUrl={asset.get_url}
                    onSave={handleSave}
                    onClose={handleClose}
                    title={`Edit: ${asset.name || "Image"}`}
                />
            )}
            {isSaving && (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(0, 0, 0, 0.7)",
                        zIndex: 20000
                    }}
                >
                    <CircularProgress />
                </div>
            )}
        </div>
    );
};

export default AssetEditor;
