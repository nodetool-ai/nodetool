/** @jsxImportSource @emotion/react */
import React, { useState, useCallback } from "react";
import {
  Box,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from "@mui/material";
import { Text, Caption, FlexRow, EditorButton, AlertBanner } from "../ui_primitives";
import { useComfyUIStore } from "../../stores/ComfyUIStore";
import type { ComfyBackendType } from "../../stores/ComfyUIStore";
import useSecretsStore from "../../stores/SecretsStore";
import { useSecrets } from "../../hooks/useSecrets";
import { useTheme } from "@mui/material/styles";

const RUNPOD_API_KEY = "RUNPOD_API_KEY";

const ComfyUISettings: React.FC = () => {
  const theme = useTheme();
  const hasElectronProxyBridge =
    typeof window !== "undefined" &&
    typeof window.api?.localhostProxy?.request === "function";

  const baseUrl = useComfyUIStore((state) => state.baseUrl);
  const isConnected = useComfyUIStore((state) => state.isConnected);
  const isConnecting = useComfyUIStore((state) => state.isConnecting);
  const connectionError = useComfyUIStore((state) => state.connectionError);
  const backendType = useComfyUIStore((state) => state.backendType);

  const setBaseUrl = useComfyUIStore((state) => state.setBaseUrl);
  const connect = useComfyUIStore((state) => state.connect);
  const disconnect = useComfyUIStore((state) => state.disconnect);
  const setBackendType = useComfyUIStore((state) => state.setBackendType);
  const setRunpodKeyConfigured = useComfyUIStore((state) => state.setRunpodKeyConfigured);

  const updateSecret = useSecretsStore((state) => state.updateSecret);
  const { isApiKeySet } = useSecrets();

  const [localUrl, setLocalUrl] = useState(baseUrl);
  const [localApiKey, setLocalApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const runpodKeyConfigured = isApiKeySet(RUNPOD_API_KEY);

  const handleConnect = useCallback(async () => {
    try {
      setBaseUrl(localUrl);
      await connect();
    } catch (_error) {
      // Error is handled in the store
    }
  }, [localUrl, setBaseUrl, connect]);

  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const handleBackendChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, value: ComfyBackendType | null) => {
      if (value) {
        setBackendType(value);
      }
    },
    [setBackendType]
  );

  const handleSaveApiKey = useCallback(async () => {
    if (!localApiKey) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await updateSecret(
        RUNPOD_API_KEY,
        localApiKey,
        "RunPod API key for ComfyUI serverless endpoints"
      );
      setLocalApiKey("");
      setSaveSuccess(true);
      setRunpodKeyConfigured(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to save API key";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }, [localApiKey, updateSecret, setRunpodKeyConfigured]);

  return (
    <Box sx={{ p: 2 }}>
      <Text size="normal" weight={600} sx={{ mb: 2 }}>
        ComfyUI Connection
      </Text>

      <Text size="small" color="secondary" sx={{ mb: 2 }}>
        Connect to a ComfyUI backend to enable ComfyUI workflow execution.
      </Text>

      <ToggleButtonGroup
        value={backendType}
        exclusive
        onChange={handleBackendChange}
        size="small"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="local">Local ComfyUI</ToggleButton>
        <ToggleButton value="runpod">RunPod</ToggleButton>
      </ToggleButtonGroup>

      {backendType === "local" && (
        <>
          <TextField
            fullWidth
            label="ComfyUI Backend URL"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            disabled={isConnecting || isConnected}
            placeholder={
              hasElectronProxyBridge
                ? "http://localhost:8000/api"
                : "/comfy-api (dev) or http://localhost:8000/api"
            }
            sx={{ mb: 2 }}
          />

          {connectionError && (
            <AlertBanner severity="error" sx={{ mb: 2 }}>
              {connectionError}
            </AlertBanner>
          )}

          {isConnected && (
            <AlertBanner severity="success" sx={{ mb: 2 }}>
              Connected to ComfyUI backend
            </AlertBanner>
          )}

          <FlexRow gap={2}>
            {!isConnected ? (
              <EditorButton
                variant="contained"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? "Connecting..." : "Connect"}
              </EditorButton>
            ) : (
              <EditorButton variant="outlined" onClick={handleDisconnect}>
                Disconnect
              </EditorButton>
            )}
          </FlexRow>

          <Caption
            sx={{ mt: 2, display: "block" }}
          >
            ComfyUI must be running and accessible at the specified URL.
          </Caption>
        </>
      )}

      {backendType === "runpod" && (
        <>
          <TextField
            fullWidth
            label="RunPod API Key"
            type="password"
            value={localApiKey}
            onChange={(e) => {
              setLocalApiKey(e.target.value);
              setSaveSuccess(false);
            }}
            disabled={saving}
            placeholder={runpodKeyConfigured ? "••••••••  (saved)" : "rpa_..."}
            helperText={
              runpodKeyConfigured
                ? "API key is saved securely. Enter a new value to update it."
                : "Your API key will be stored securely as an encrypted secret."
            }
            sx={{ mb: 2 }}
          />

          {saveError && (
            <AlertBanner severity="error" sx={{ mb: 2 }}>
              {saveError}
            </AlertBanner>
          )}

          {saveSuccess && (
            <AlertBanner severity="success" sx={{ mb: 2 }}>
              RunPod API key saved securely.
            </AlertBanner>
          )}

          {runpodKeyConfigured && !saveSuccess && (
            <AlertBanner severity="info" sx={{ mb: 2 }}>
              RunPod API key is configured. Set the endpoint ID on each
              &quot;Run ComfyUI Workflow (RunPod)&quot; node in your workflow.
            </AlertBanner>
          )}

          <EditorButton
            variant="contained"
            onClick={handleSaveApiKey}
            disabled={saving || !localApiKey}
          >
            {saving ? "Saving..." : "Save API Key"}
          </EditorButton>

          <Caption
            sx={{ mt: 2, display: "block" }}
          >
            Deploy a ComfyUI worker on RunPod Serverless, then add a
            &quot;Run ComfyUI Workflow (RunPod)&quot; node to your workflow with
            the endpoint ID.
          </Caption>
        </>
      )}
    </Box>
  );
};

export default ComfyUISettings;
