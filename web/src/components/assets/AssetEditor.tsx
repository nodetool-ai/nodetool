/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Text, LoadingSpinner, EditorButton, FlexColumn } from "../ui_primitives";
import { useAssetStore } from "../../stores/AssetStore";
import { useAssetById } from "../../serverState/useAssetById";
import { BASE_URL } from "../../stores/BASE_URL";
import type { Asset } from "../../stores/ApiTypes";
import { ImageEditor } from "../node/image_editor";

/**
 * Normalize API media URLs for use in <img> / canvas loaders.
 * Relative paths (e.g. /api/assets/.../thumbnail) need the API origin when VITE_API_URL is set.
 */
const resolvePublicMediaUrl = (url: string | null | undefined): string | null => {
    if (url == null) {
        return null;
    }
    const t = url.trim();
    if (t === "") {
        return null;
    }
    if (
        t.startsWith("http://") ||
        t.startsWith("https://") ||
        t.startsWith("data:") ||
        t.startsWith("blob:")
    ) {
        return t;
    }
    if (t.startsWith("/")) {
        return `${BASE_URL}${t}`;
    }
    return t;
};

const resolveImageEditorSource = (asset: Asset): string | null => {
    const primary = resolvePublicMediaUrl(asset.get_url);
    if (primary) {
        return primary;
    }
    const thumb = resolvePublicMediaUrl(asset.thumb_url);
    if (thumb) {
        console.warn(
            `[AssetEditor] Asset ${asset.id} has no get_url; using thumb_url for the editor (lower resolution).`
        );
        return thumb;
    }
    return null;
};

const styles = (theme: Theme) =>
    css({
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: theme.vars.palette.grey[900],
        ".error-container": {
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
            console.error("[AssetEditor] Failed to fetch asset:", queryError);
            return "Failed to load asset";
        }
        if (!loading && !asset) {
            return "Asset not found";
        }
        if (asset && !asset.content_type?.startsWith("image/")) {
            return "Asset is not an image";
        }
        if (asset && asset.content_type?.startsWith("image/")) {
            const src = resolveImageEditorSource(asset);
            if (!src) {
                console.error(
                    "[AssetEditor] Image asset has no get_url or thumb_url; cannot load ImageEditor.",
                    asset.id
                );
                return "This image has no download URL (get_url). Cannot open the editor.";
            }
        }
        return null;
    }, [assetId, asset, loading, queryError]);

    const imageEditorUrl = useMemo(
        () => (asset && asset.content_type?.startsWith("image/") ? resolveImageEditorSource(asset) : null),
        [asset]
    );

    // Handle close: go back when possible; deep links / first history entry cannot use -1
    const handleClose = useCallback(() => {
        const idx = (window.history.state as { idx?: number } | null)?.idx;
        if (typeof idx === "number" && idx <= 0) {
            navigate("/assets");
            return;
        }
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
                console.info(`[AssetEditor] Saving edited image for asset: ${asset.id}`);

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

                console.info(
                    `[AssetEditor] Successfully saved edited image for asset: ${asset.id}`
                );

                // Navigate back after successful save
                navigate(-1);
            } catch (err) {
                console.error("[AssetEditor] Failed to save edited image:", err);
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
            <FlexColumn css={styles(theme)} fullWidth fullHeight align="center" justify="center" gap={2}>
                    <LoadingSpinner />
                    <Text>Loading asset...</Text>
            </FlexColumn>
        );
    }

    // Error state
    if (error || !asset) {
        return (
            <FlexColumn
                css={styles(theme)}
                className="error-container"
                fullWidth
                fullHeight
                align="center"
                justify="center"
                gap={2}
            >
                    <Text size="normal" weight={600}>{error || "Unknown error"}</Text>
                    <EditorButton
                        variant="text"
                        density="compact"
                        onClick={handleClose}
                        aria-label="Go back to previous page"
                    >
                        Go back
                    </EditorButton>
            </FlexColumn>
        );
    }

    // Render editor
    return (
        <FlexColumn css={styles(theme)} fullWidth fullHeight>
            {imageEditorUrl ? (
                <ImageEditor
                    imageUrl={imageEditorUrl}
                    onSave={handleSave}
                    onClose={handleClose}
                    title={`Edit: ${asset.name || "Image"}`}
                    />
            ) : null}
            {isSaving && (
                <FlexColumn
                    sx={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0, 0, 0, 0.7)",
                        zIndex: 20000
                    }}
                    fullWidth
                    fullHeight
                    align="center"
                    justify="center"
                >
                    <LoadingSpinner />
                </FlexColumn>
            )}
        </FlexColumn>
    );
};

export default AssetEditor;
