/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Typography,
  Button,
  Box,
  LinearProgress,
  IconButton,
  Alert,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import MemoryIcon from "@mui/icons-material/Memory";
import React, { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  MemoryStats,
  LoadedModelsResponse,
  ModelUnloadResult,
  MemoryCleanupResult
} from "../../types/memory";
import { useNotificationStore } from "../../stores/NotificationStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme) =>
  css({
    ".dialog-title": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: theme.spacing(2),
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".stats-container": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2),
      marginBottom: theme.spacing(3)
    },
    ".stat-item": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1)
    },
    ".stat-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    },
    ".models-section": {
      marginTop: theme.spacing(3)
    },
    ".actions-bar": {
      display: "flex",
      gap: theme.spacing(1),
      marginTop: theme.spacing(2),
      paddingTop: theme.spacing(2),
      borderTop: `1px solid ${theme.vars.palette.divider}`
    },
    ".table-container": {
      maxHeight: 400,
      marginTop: theme.spacing(2)
    }
  });

interface MemoryManagementDialogProps {
  open: boolean;
  onClose: () => void;
}

const MemoryManagementDialog: React.FC<MemoryManagementDialogProps> = ({
  open,
  onClose
}) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  // Fetch memory stats
  const {
    data: memoryStats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats
  } = useQuery<MemoryStats>({
    queryKey: ["memory-stats"],
    queryFn: async () => {
      const response = await fetch("/api/memory");
      if (!response.ok) {
        throw new Error("Failed to fetch memory stats");
      }
      return response.json();
    },
    enabled: open,
    refetchInterval: 5000 // Refresh every 5 seconds when dialog is open
  });

  // Fetch loaded models
  const {
    data: modelsResponse,
    isLoading: modelsLoading,
    error: modelsError,
    refetch: refetchModels
  } = useQuery<LoadedModelsResponse>({
    queryKey: ["loaded-models"],
    queryFn: async () => {
      const response = await fetch("/api/memory/models");
      if (!response.ok) {
        throw new Error("Failed to fetch loaded models");
      }
      return response.json();
    },
    enabled: open
  });

  const loadedModels = modelsResponse?.models ?? [];

  // Unload specific model mutation
  const unloadModelMutation = useMutation<
    ModelUnloadResult,
    Error,
    { id: string; force?: boolean }
  >({
    mutationFn: async ({ id, force = false }) => {
      const url = `/api/memory/models/${encodeURIComponent(id)}${force ? "?force=true" : ""}`;
      const response = await fetch(url, {
        method: "DELETE"
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to unload model");
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      addNotification({
        type: "success",
        content:
          data.message ||
          `Model ${variables.id} unloaded (freed ${formatMB(data.memory_freed_mb)})`,
        alert: true
      });
      queryClient.invalidateQueries({ queryKey: ["memory-stats"] });
      queryClient.invalidateQueries({ queryKey: ["loaded-models"] });
    },
    onError: (error) => {
      addNotification({
        type: "error",
        content: error.message,
        dismissable: true
      });
    }
  });

  // Clear all models mutation
  const clearModelsMutation = useMutation<MemoryCleanupResult, Error>({
    mutationFn: async () => {
      const response = await fetch("/api/memory/models/clear", {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Failed to clear models");
      }
      return response.json();
    },
    onSuccess: (data) => {
      addNotification({
        type: "success",
        content: `Unloaded ${data.models_unloaded} models, freed ${formatMB(data.ram_freed_mb)}`,
        alert: true
      });
      queryClient.invalidateQueries({ queryKey: ["memory-stats"] });
      queryClient.invalidateQueries({ queryKey: ["loaded-models"] });
    },
    onError: (error) => {
      addNotification({
        type: "error",
        content: error.message,
        dismissable: true
      });
    }
  });

  // Clear GPU cache mutation
  const clearGPUMutation = useMutation<MemoryCleanupResult, Error>({
    mutationFn: async () => {
      const response = await fetch("/api/memory/gpu", {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Failed to clear GPU cache");
      }
      return response.json();
    },
    onSuccess: (data) => {
      addNotification({
        type: "success",
        content: data.message,
        alert: true
      });
      queryClient.invalidateQueries({ queryKey: ["memory-stats"] });
    },
    onError: (error) => {
      addNotification({
        type: "error",
        content: error.message,
        dismissable: true
      });
    }
  });

  // Full cleanup mutation
  const fullCleanupMutation = useMutation<MemoryCleanupResult, Error>({
    mutationFn: async () => {
      const response = await fetch("/api/memory/all", {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Failed to perform full cleanup");
      }
      return response.json();
    },
    onSuccess: (data) => {
      addNotification({
        type: "success",
        content: `Full cleanup: ${data.models_unloaded} models unloaded, ${data.cache_items_cleared} cache items cleared, ${formatMB(data.ram_freed_mb)} freed`,
        alert: true
      });
      queryClient.invalidateQueries({ queryKey: ["memory-stats"] });
      queryClient.invalidateQueries({ queryKey: ["loaded-models"] });
    },
    onError: (error) => {
      addNotification({
        type: "error",
        content: error.message,
        dismissable: true
      });
    }
  });

  const handleRefresh = useCallback(() => {
    refetchStats();
    refetchModels();
  }, [refetchStats, refetchModels]);

  const handleUnloadModel = useCallback(
    (id: string) => {
      unloadModelMutation.mutate({ id });
    },
    [unloadModelMutation]
  );

  const handleClearAllModels = useCallback(() => {
    if (
      // eslint-disable-next-line no-alert
      window.confirm(
        "Are you sure you want to unload all models? This may affect running workflows."
      )
    ) {
      clearModelsMutation.mutate();
    }
  }, [clearModelsMutation]);

  const handleClearGPU = useCallback(() => {
    clearGPUMutation.mutate();
  }, [clearGPUMutation]);

  const handleFullCleanup = useCallback(() => {
    if (
      // eslint-disable-next-line no-alert
      window.confirm(
        "Are you sure you want to perform a full cleanup? This will unload all models and clear all caches."
      )
    ) {
      fullCleanupMutation.mutate();
    }
  }, [fullCleanupMutation]);

  // Format MB values with appropriate units
  const formatMB = (mb: number | undefined | null): string => {
    if (mb === undefined || mb === null) {
      return "N/A";
    }
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(0)} MB`;
  };

  // Calculate RAM usage percentage
  const getRamPercent = (): number => {
    if (!memoryStats?.ram_total_mb || memoryStats.ram_total_mb === 0) {
      return 0;
    }
    return (memoryStats.ram_mb / memoryStats.ram_total_mb) * 100;
  };

  // Calculate GPU usage percentage
  const getGpuPercent = (): number => {
    if (!memoryStats?.gpu_total_mb || memoryStats.gpu_total_mb === 0) {
      return 0;
    }
    return ((memoryStats.gpu_allocated_mb ?? 0) / memoryStats.gpu_total_mb) * 100;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      css={styles(theme)}
    >
      <DialogTitle className="dialog-title">
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <MemoryIcon />
          <Typography variant="h6">Memory Management</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Refresh" enterDelay={TOOLTIP_ENTER_DELAY}>
            <IconButton onClick={handleRefresh} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {(statsError || modelsError) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {statsError
              ? "Failed to load memory stats"
              : "Failed to load models"}
          </Alert>
        )}

        {/* Memory Stats Section */}
        <div className="stats-container">
          <Typography variant="h6">System Memory</Typography>

          {statsLoading ? (
            <LinearProgress />
          ) : memoryStats ? (
            <>
              <div className="stat-item">
                <div className="stat-header">
                  <Typography variant="body2" color="text.secondary">
                    RAM Usage
                  </Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {formatMB(memoryStats.ram_mb)}
                    {memoryStats.ram_total_mb &&
                      ` / ${formatMB(memoryStats.ram_total_mb)}`}{" "}
                    ({getRamPercent().toFixed(1)}%)
                  </Typography>
                </div>
                <LinearProgress
                  variant="determinate"
                  value={getRamPercent()}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </div>

              {memoryStats.gpu_allocated_mb !== undefined &&
                memoryStats.gpu_allocated_mb !== null && (
                  <>
                    <div className="stat-item">
                      <div className="stat-header">
                        <Typography variant="body2" color="text.secondary">
                          GPU Memory Allocated
                        </Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {formatMB(memoryStats.gpu_allocated_mb)}
                          {memoryStats.gpu_total_mb &&
                            ` / ${formatMB(memoryStats.gpu_total_mb)}`}
                        </Typography>
                      </div>
                      <LinearProgress
                        variant="determinate"
                        value={getGpuPercent()}
                        sx={{ height: 8, borderRadius: 4 }}
                        color="secondary"
                      />
                    </div>

                    {memoryStats.gpu_reserved_mb !== undefined &&
                      memoryStats.gpu_reserved_mb !== null && (
                        <div className="stat-item">
                          <div className="stat-header">
                            <Typography variant="body2" color="text.secondary">
                              GPU Memory Reserved
                            </Typography>
                            <Typography variant="body2" fontWeight="bold">
                              {formatMB(memoryStats.gpu_reserved_mb)}
                            </Typography>
                          </div>
                        </div>
                      )}
                  </>
                )}

              <div className="stat-item">
                <div className="stat-header">
                  <Typography variant="body2" color="text.secondary">
                    Loaded Models
                  </Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {memoryStats.loaded_models_count} ({formatMB(memoryStats.loaded_models_memory_mb)})
                  </Typography>
                </div>
              </div>

              <div className="stat-item">
                <div className="stat-header">
                  <Typography variant="body2" color="text.secondary">
                    Cache Items
                  </Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {memoryStats.memory_cache_count}
                  </Typography>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Loaded Models Section */}
        <div className="models-section">
          <Typography variant="h6" sx={{ mb: 2 }}>
            Loaded Models
          </Typography>

          {modelsLoading ? (
            <LinearProgress />
          ) : loadedModels.length > 0 ? (
            <TableContainer component={Paper} className="table-container">
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Device</TableCell>
                    <TableCell align="right">Memory</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loadedModels.map((model) => (
                    <TableRow key={model.id}>
                      <TableCell>
                        <Tooltip
                          title={model.model_id || model.id}
                          enterDelay={TOOLTIP_ENTER_DELAY}
                        >
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{ maxWidth: 200 }}
                          >
                            {model.model_id || model.id}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                          {model.type}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={model.device}
                          size="small"
                          color={model.device === "cuda" ? "primary" : "default"}
                          sx={{ height: 20 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {formatMB(model.memory_mb)}
                      </TableCell>
                      <TableCell>
                        {model.offloaded ? (
                          <Chip
                            label="Offloaded"
                            size="small"
                            color="info"
                            sx={{ height: 20 }}
                          />
                        ) : (
                          <Chip
                            label="Active"
                            size="small"
                            color="success"
                            sx={{ height: 20 }}
                          />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip
                          title="Unload model"
                          enterDelay={TOOLTIP_ENTER_DELAY}
                        >
                          <IconButton
                            size="small"
                            onClick={() => handleUnloadModel(model.id)}
                            disabled={unloadModelMutation.isPending}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info">No models currently loaded</Alert>
          )}
        </div>

        {/* Actions Bar */}
        <div className="actions-bar">
          <Button
            variant="outlined"
            size="small"
            onClick={handleClearGPU}
            disabled={clearGPUMutation.isPending}
          >
            Clear GPU Cache
          </Button>
          <Button
            variant="outlined"
            size="small"
            color="warning"
            onClick={handleClearAllModels}
            disabled={clearModelsMutation.isPending || loadedModels.length === 0}
          >
            Unload All Models
          </Button>
          <Button
            variant="contained"
            size="small"
            color="error"
            onClick={handleFullCleanup}
            disabled={fullCleanupMutation.isPending}
          >
            Full Cleanup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MemoryManagementDialog;
