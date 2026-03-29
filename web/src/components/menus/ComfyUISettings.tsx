/** @jsxImportSource @emotion/react */
import React, { useState, useCallback } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert
} from "@mui/material";
import { useComfyUIStore } from "../../stores/ComfyUIStore";
import { useTheme } from "@mui/material/styles";

const ComfyUISettings: React.FC = () => {
  const theme = useTheme();
  const hasElectronProxyBridge =
    typeof window !== "undefined" &&
    typeof window.api?.localhostProxy?.request === "function";

  // Use selective selectors to prevent unnecessary re-renders
  // Only subscribe to the specific state values this component uses
  const baseUrl = useComfyUIStore((state) => state.baseUrl);
  const isConnected = useComfyUIStore((state) => state.isConnected);
  const isConnecting = useComfyUIStore((state) => state.isConnecting);
  const connectionError = useComfyUIStore((state) => state.connectionError);

  // Actions are stable references, so we can destructure them directly
  const setBaseUrl = useComfyUIStore((state) => state.setBaseUrl);
  const connect = useComfyUIStore((state) => state.connect);
  const disconnect = useComfyUIStore((state) => state.disconnect);

  const [localUrl, setLocalUrl] = useState(baseUrl);

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

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        ComfyUI Connection
      </Typography>
      
      <Typography variant="body2" sx={{ mb: 2, color: theme.palette.text.secondary }}>
        Connect to a ComfyUI backend to enable ComfyUI workflow execution.
      </Typography>

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
          <Button
            variant="outlined"
            onClick={handleDisconnect}
          >
            Disconnect
          </Button>
        )}
      </Box>

      <Typography variant="caption" sx={{ mt: 2, display: "block", color: theme.palette.text.secondary }}>
        ComfyUI must be running and accessible at the specified URL.
      </Typography>
    </Box>
  );
};

export default ComfyUISettings;
