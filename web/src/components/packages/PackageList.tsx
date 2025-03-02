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
import InfoIcon from "@mui/icons-material/Info";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import { components } from "../../api";

// Define types based on the API schema
type PackageInfo = components["schemas"]["PackageInfo"];
type PackageModel = components["schemas"]["PackageModel"];
type PackageListResponse = components["schemas"]["PackageListResponse"];
type InstalledPackageListResponse =
  components["schemas"]["InstalledPackageListResponse"];

const styles = (theme: any) =>
  css({
    root: {
      width: "100%",
      backgroundColor: theme.palette.c_black || "#000000"
    },
    searchContainer: {
      padding: theme.spacing(2),
      display: "flex",
      alignItems: "center",
      backgroundColor: theme.palette.c_black || "#000000",
      color: theme.palette.c_white || "#FFFFFF"
    },
    searchInput: {
      marginLeft: theme.spacing(1),
      flex: 1
    },
    listContainer: {
      maxHeight: "70vh",
      overflow: "auto",
      margin: "0 20px",
      backgroundColor: theme.palette.c_black || "#000000"
    },
    packageItem: {
      borderBottom: `1px solid ${theme.palette.divider}`,
      backgroundColor: theme.palette.c_black || "#000000",
      "&:hover": {
        backgroundColor: theme.palette.c_gray0 || "#0E0E0E"
      }
    },
    packageName: {
      fontWeight: "bold",
      color: theme.palette.c_white || "#FFFFFF"
    },
    packageDescription: {
      color: theme.palette.c_gray5 || "#BDBDBD"
    },
    chip: {
      margin: theme.spacing(0.5)
    },
    installButton: {
      marginLeft: theme.spacing(1)
    },
    loadingContainer: {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: theme.spacing(4),
      backgroundColor: theme.palette.c_black || "#000000",
      color: theme.palette.c_white || "#FFFFFF"
    },
    errorContainer: {
      padding: theme.spacing(2),
      color: theme.palette.error.main,
      backgroundColor: theme.palette.c_black || "#000000"
    }
  });

const PackageList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
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
      const { data, error } = await client.POST("/api/packages/install", {
        body: { repo_id: repoId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installedPackages"] });
    }
  });

  // Uninstall package mutation
  const uninstallMutation = useMutation({
    mutationFn: async (repoId: string) => {
      const { data, error } = await client.DELETE("/api/packages/{repo_id}", {
        params: { path: { repo_id: repoId } }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installedPackages"] });
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
        className="loadingContainer"
        sx={{ backgroundColor: "black" }}
      >
        <CircularProgress />
        <Typography variant="body1" style={{ marginTop: 16 }}>
          Loading packages...
        </Typography>
      </Box>
    );
  }

  // Error state
  if (availableError || installedError) {
    return (
      <Box
        css={styles}
        className="errorContainer"
        sx={{ backgroundColor: "black" }}
      >
        <Typography variant="h6" color="error">
          Error loading packages
        </Typography>
        <Typography variant="body1">
          {availableError ? String(availableError) : String(installedError)}
        </Typography>
      </Box>
    );
  }

  return (
    <Paper css={styles} sx={{ backgroundColor: "black" }}>
      <Box className="searchContainer">
        <TextField
          className="searchInput"
          placeholder="Search packages..."
          value={searchTerm}
          onChange={handleSearchChange}
          variant="outlined"
          size="small"
          sx={{
            "& .MuiOutlinedInput-root": {
              backgroundColor: theme.palette.c_gray0 || "#0E0E0E",
              color: theme.palette.c_white || "#FFFFFF",
              "& fieldset": {
                borderColor: theme.palette.c_gray2 || "#444444"
              },
              "&:hover fieldset": {
                borderColor: theme.palette.c_gray3 || "#6D6D6D"
              }
            },
            "& .MuiInputLabel-root": {
              color: theme.palette.c_gray4 || "#959595"
            }
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon
                  sx={{ color: theme.palette.c_gray4 || "#959595" }}
                />
              </InputAdornment>
            )
          }}
        />
      </Box>
      <Divider sx={{ backgroundColor: theme.palette.c_gray2 || "#444444" }} />

      <Box className="listContainer">
        <List>
          {filteredPackages.length === 0 ? (
            <ListItem>
              <ListItemText
                primary={
                  <Typography
                    sx={{ color: theme.palette.c_white || "#FFFFFF" }}
                  >
                    No packages found
                  </Typography>
                }
              />
            </ListItem>
          ) : (
            filteredPackages.map((pkg) => {
              const isInstalled = isPackageInstalled(pkg.repo_id);

              return (
                <ListItem key={pkg.repo_id} className="packageItem">
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center">
                        <Typography
                          className="packageName"
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
                            />
                          </Tooltip>
                        )}
                      </Box>
                    }
                    secondary={
                      <>
                        <Typography
                          className="packageDescription"
                          variant="body2"
                          sx={{ color: theme.palette.c_gray5 || "#BDBDBD" }}
                        >
                          {pkg.description}
                        </Typography>
                        <Box mt={1}>
                          <Chip
                            key={pkg.repo_id}
                            label={pkg.repo_id}
                            size="small"
                            className="chip"
                            sx={{
                              backgroundColor:
                                theme.palette.c_gray1 || "#242424",
                              color: theme.palette.c_gray5 || "#BDBDBD"
                            }}
                          />
                        </Box>
                      </>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Button
                      variant="outlined"
                      color={isInstalled ? "secondary" : "primary"}
                      size="small"
                      className="installButton"
                      onClick={() =>
                        handlePackageAction(pkg.repo_id, isInstalled)
                      }
                      startIcon={isInstalled ? null : <CloudDownloadIcon />}
                      disabled={
                        installMutation.isPending || uninstallMutation.isPending
                      }
                    >
                      {isInstalled ? "Uninstall" : "Install"}
                    </Button>
                  </ListItemSecondaryAction>
                </ListItem>
              );
            })
          )}
        </List>
      </Box>
    </Paper>
  );
};

export default PackageList;
