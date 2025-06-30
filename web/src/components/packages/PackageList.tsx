/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  CircularProgress,
  Button,
  Chip,
  Paper,
  Divider,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  useTheme
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import { components } from "../../api";
import { loadMetadata } from "../../serverState/useMetadata";

// Define types based on the API schema
type PackageListResponse = components["schemas"]["PackageListResponse"];
type InstalledPackageListResponse =
  components["schemas"]["InstalledPackageListResponse"];

const styles = (theme: any) =>
  css({
    backgroundColor: theme.palette.grey[800],
    color: theme.palette.grey[0],
    height: "100%",
    display: "flex",
    flexDirection: "column",
    position: "relative",

    "& .loadingContainer": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100%"
    },

    "& .searchContainer": {
      padding: theme.spacing(2),
      position: "sticky",
      top: 0,
      zIndex: 1,
      backgroundColor: theme.palette.grey[800]
    },

    "& .listContainer": {
      flexGrow: 1,
      overflow: "auto"
    },

    "& .packageItem": {
      borderBottom: `1px solid ${theme.palette.grey[600]}`,
      "&:last-child": {
        borderBottom: "none"
      }
    },

    "& .packageName": {
      fontWeight: 500
    },

    "& .packagelist-item-chip": {
      padding: "0",
      margin: 0,
      backgroundColor: "transparent",
      color: theme.palette.grey[200]
    },

    "& .installButton": {
      minWidth: 100
    },

    "& .overlayContainer": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      backdropFilter: "blur(3px)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10,
      animation: "fadeIn 0.3s ease-in-out",
      "@keyframes fadeIn": {
        "0%": {
          opacity: 0
        },
        "100%": {
          opacity: 1
        }
      }
    },

    "& .progressText": {
      marginTop: theme.spacing(2),
      color: theme.palette.grey[0],
      fontWeight: 500
    }
  });

const PackageList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activePackageId, setActivePackageId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const theme = useTheme();

  // Fetch available packages
  const {
    data: availablePackages,
    isLoading: isLoadingAvailable,
    error: availableError
  } = useQuery<PackageListResponse>({
    queryKey: ["availablePackages"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/packages/available", {});
      if (error) throw error;
      return data;
    }
  });

  // Fetch installed packages
  const {
    data: installedPackages,
    isLoading: isLoadingInstalled,
    error: installedError
  } = useQuery<InstalledPackageListResponse>({
    queryKey: ["installedPackages"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/packages/installed", {});
      if (error) throw error;
      return data;
    }
  });

  // Install package mutation
  const installMutation = useMutation({
    mutationFn: async (repoId: string) => {
      setActivePackageId(repoId);
      const { data, error } = await client.POST("/api/packages/install", {
        body: { repo_id: repoId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installedPackages"] });
      // Reload metadata after package installation
      loadMetadata();
      setActivePackageId(null);
    },
    onError: () => {
      setActivePackageId(null);
    }
  });

  // Uninstall package mutation
  const uninstallMutation = useMutation({
    mutationFn: async (repoId: string) => {
      setActivePackageId(repoId);
      const { data, error } = await client.DELETE("/api/packages/uninstall", {
        body: { repo_id: repoId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installedPackages"] });
      // Reload metadata after package uninstallation
      loadMetadata();
      setActivePackageId(null);
    },
    onError: () => {
      setActivePackageId(null);
    }
  });

  // Filter packages based on search term
  const filteredPackages = useMemo(() => {
    if (!availablePackages?.packages) return [];

    return availablePackages.packages.filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pkg.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pkg.repo_id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [availablePackages, searchTerm]);

  // Check if a package is installed
  const isPackageInstalled = (repoId: string): boolean => {
    if (!installedPackages?.packages) return false;
    return installedPackages.packages.some((pkg) => pkg.repo_id === repoId);
  };

  // Handle search input change
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  // Handle install/uninstall button click
  const handlePackageAction = (repoId: string, isInstalled: boolean) => {
    // Prevent action if another package is already being processed
    if (installMutation.isPending || uninstallMutation.isPending) {
      return;
    }

    if (isInstalled) {
      uninstallMutation.mutate(repoId);
    } else {
      installMutation.mutate(repoId);
    }
  };

  // Loading state
  if (isLoadingAvailable || isLoadingInstalled) {
    return (
      <Box
        css={styles}
        className="loadingContainer packagelist-loading"
        sx={{ backgroundColor: "black" }}
      >
        <CircularProgress />
        <Typography variant="body1" style={{ marginTop: 16 }}>
          Loading packs...
        </Typography>
      </Box>
    );
  }

  // Error state
  if (availableError || installedError) {
    return (
      <Box
        css={styles}
        className="errorContainer packagelist-error"
        sx={{ backgroundColor: "black" }}
      >
        <Typography variant="h6" color="error">
          Error loading packs
        </Typography>
        <Typography variant="body1">
          {availableError ? String(availableError) : String(installedError)}
        </Typography>
      </Box>
    );
  }

  return (
    <Paper css={styles} elevation={0} className="packagelist-root">
      {(installMutation.isPending || uninstallMutation.isPending) && (
        <Box className="overlayContainer packagelist-overlay">
          <CircularProgress size={60} color="primary" />
          <Typography
            variant="h6"
            className="progressText packagelist-overlay-text"
          >
            {activePackageId &&
              (installMutation.isPending
                ? `Installing ${
                    availablePackages?.packages.find(
                      (p) => p.repo_id === activePackageId
                    )?.name || "package"
                  }...`
                : `Uninstalling ${
                    availablePackages?.packages.find(
                      (p) => p.repo_id === activePackageId
                    )?.name || "package"
                  }...`)}
          </Typography>
        </Box>
      )}
      <Box className="searchContainer packagelist-search">
        <TextField
          className="searchInput packagelist-search-input"
          placeholder="Search packs..."
          value={searchTerm}
          onChange={handleSearchChange}
          variant="outlined"
          size="small"
          disabled={installMutation.isPending || uninstallMutation.isPending}
          sx={{
            "& .MuiOutlinedInput-root": {
              backgroundColor: theme.palette.grey[900],
              color: theme.palette.grey[0],
              "& fieldset": {
                borderColor: theme.palette.grey[600]
              },
              "&:hover fieldset": {
                borderColor: theme.palette.grey[500]
              }
            },
            "& .MuiInputLabel-root": {
              color: theme.palette.grey[400]
            }
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: theme.palette.grey[400] }} />
              </InputAdornment>
            )
          }}
        />
      </Box>
      <Divider sx={{ backgroundColor: theme.palette.grey[600] }} />

      <Box className="listContainer packagelist-list">
        <List>
          {filteredPackages.length === 0 ? (
            <ListItem className="packagelist-item-empty">
              <ListItemText
                primary={
                  <Typography sx={{ color: theme.palette.grey[0] }}>
                    No packs found
                  </Typography>
                }
              />
            </ListItem>
          ) : (
            filteredPackages.map((pkg) => {
              const isInstalled = isPackageInstalled(pkg.repo_id);

              return (
                <Tooltip title={pkg.description} key={pkg.repo_id}>
                  <ListItem
                    className="packageItem packagelist-item"
                    sx={{
                      opacity:
                        installMutation.isPending || uninstallMutation.isPending
                          ? activePackageId === pkg.repo_id
                            ? 1
                            : 0.6
                          : 1,
                      transition: "opacity 0.2s ease-in-out"
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center">
                          <Typography
                            className="packageName packagelist-item-name"
                            sx={{ color: "white" }}
                          >
                            {pkg.name}
                          </Typography>
                          {isInstalled && (
                            <Tooltip title="Installed">
                              <CheckCircleIcon
                                color="success"
                                fontSize="small"
                                style={{ marginLeft: 8 }}
                                className="packagelist-item-installed-icon"
                              />
                            </Tooltip>
                          )}
                        </Box>
                      }
                      secondary={
                        <Box mt={1} className="packagelist-item-secondary">
                          <Chip
                            className="packagelist-item-chip"
                            key={pkg.repo_id}
                            label={
                              <a
                                href={"https://github.com/" + pkg.repo_id}
                                target="_blank"
                                rel="noopener noreferrer"
                                css={{
                                  color: theme.palette.grey[200],
                                  textDecoration: "none",
                                  "&:hover": {
                                    textDecoration: "underline"
                                  }
                                }}
                              >
                                {pkg.repo_id}
                              </a>
                            }
                            size="small"
                          />
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Button
                        variant="outlined"
                        color={isInstalled ? "secondary" : "primary"}
                        size="small"
                        className="installButton packagelist-item-button"
                        onClick={() =>
                          handlePackageAction(pkg.repo_id, isInstalled)
                        }
                        startIcon={
                          activePackageId === pkg.repo_id ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : isInstalled ? null : (
                            <CloudDownloadIcon />
                          )
                        }
                        disabled={
                          installMutation.isPending ||
                          uninstallMutation.isPending
                        }
                      >
                        {activePackageId === pkg.repo_id
                          ? isInstalled
                            ? "Uninstalling..."
                            : "Installing..."
                          : isInstalled
                          ? "Uninstall"
                          : "Install"}
                      </Button>
                    </ListItemSecondaryAction>
                  </ListItem>
                </Tooltip>
              );
            })
          )}
        </List>
      </Box>
    </Paper>
  );
};

export default PackageList;
