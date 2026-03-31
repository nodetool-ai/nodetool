/** @jsxImportSource @emotion/react */
import React, { useState, useCallback } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  ToggleButton,
  ToggleButtonGroup
} from "@mui/material";
import { useComfyUIStore } from "../../stores/ComfyUIStore";
import type { ComfyBackendType } from "../../stores/ComfyUIStore";
import { RunPodService } from "../../services/RunPodService";
import { useTheme } from "@mui/material/styles";

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
  const runpod = useComfyUIStore((state) => state.runpod);
  const isRunpodConnected = useComfyUIStore((state) => state.isRunpodConnected);

  const setBaseUrl = useComfyUIStore((state) => state.setBaseUrl);
  const connect = useComfyUIStore((state) => state.connect);
  const disconnect = useComfyUIStore((state) => state.disconnect);
  const setBackendType = useComfyUIStore((state) => state.setBackendType);
  const setRunpodConfig = useComfyUIStore((state) => state.setRunpodConfig);
  const setRunpodConnected = useComfyUIStore((state) => state.setRunpodConnected);

  const [localUrl, setLocalUrl] = useState(baseUrl);
  const [localApiKey, setLocalApiKey] = useState(runpod.apiKey);
  const [localEndpointId, setLocalEndpointId] = useState(runpod.endpointId);
  const [runpodConnecting, setRunpodConnecting] = useState(false);
  const [runpodError, setRunpodError] = useState<string | null>(null);

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

  const handleRunpodConnect = useCallback(async () => {
    setRunpodError(null);
    setRunpodConnecting(true);
    try {
      setRunpodConfig({ apiKey: localApiKey, endpointId: localEndpointId });
      const service = new RunPodService(localApiKey, localEndpointId);
      const healthy = await service.checkHealth();
      if (!healthy) {
        throw new Error("RunPod endpoint is not reachable. Check your endpoint ID and API key.");
      }
      setRunpodConnected(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to connect";
      setRunpodError(msg);
      setRunpodConnected(false);
    } finally {
      setRunpodConnecting(false);
    }
  }, [localApiKey, localEndpointId, setRunpodConfig, setRunpodConnected]);

  const handleRunpodDisconnect = useCallback(() => {
    setRunpodConnected(false);
  }, [setRunpodConnected]);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        ComfyUI Connection
      </Typography>

      <Typography variant="body2" sx={{ mb: 2, color: theme.palette.text.secondary }}>
        Connect to a ComfyUI backend to enable ComfyUI workflow execution.
      </Typography>

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
            <Alert severity="error" sx={{ mb: 2 }}>
              {connectionError}
            </Alert>
          )}

          {isConnected && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Connected to ComfyUI backend
            </Alert>
          )}

          <Box sx={{ display: "flex", gap: 2 }}>
            {!isConnected ? (
              <Button
                variant="contained"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
            ) : (
              <Button variant="outlined" onClick={handleDisconnect}>
                Disconnect
              </Button>
            )}
          </Box>

          <Typography
            variant="caption"
            sx={{ mt: 2, display: "block", color: theme.palette.text.secondary }}
          >
            ComfyUI must be running and accessible at the specified URL.
          </Typography>
        </>
      )}

      {backendType === "runpod" && (
        <>
          <TextField
            fullWidth
            label="RunPod API Key"
            type="password"
            value={localApiKey}
            onChange={(e) => setLocalApiKey(e.target.value)}
            disabled={runpodConnecting || isRunpodConnected}
            placeholder="rpa_..."
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label="RunPod Endpoint ID"
            value={localEndpointId}
            onChange={(e) => setLocalEndpointId(e.target.value)}
            disabled={runpodConnecting || isRunpodConnected}
            placeholder="e.g. abc123def456"
            helperText="The endpoint ID from your RunPod serverless ComfyUI worker"
            sx={{ mb: 2 }}
          />

          {runpodError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {runpodError}
            </Alert>
          )}

          {isRunpodConnected && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Connected to RunPod ComfyUI endpoint
            </Alert>
          )}

          <Box sx={{ display: "flex", gap: 2 }}>
            {!isRunpodConnected ? (
              <Button
                variant="contained"
                onClick={handleRunpodConnect}
                disabled={
                  runpodConnecting || !localApiKey || !localEndpointId
                }
              >
                {runpodConnecting ? "Connecting..." : "Connect"}
              </Button>
            ) : (
              <Button variant="outlined" onClick={handleRunpodDisconnect}>
                Disconnect
              </Button>
            )}
          </Box>

          <Typography
            variant="caption"
            sx={{ mt: 2, display: "block", color: theme.palette.text.secondary }}
          >
            Deploy a ComfyUI worker on RunPod Serverless to run workflows in the
            cloud. Use the blib-la/runpod-worker-comfy Docker image.
          </Typography>
        </>
      )}
    </Box>
  );
};

export default ComfyUISettings;
