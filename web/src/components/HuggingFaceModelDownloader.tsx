/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useState } from "react";
import { BASE_URL } from "../stores/ApiClient";
import {
  Button,
  TextField,
  Typography,
  Box,
  Autocomplete,
  LinearProgress,
} from "@mui/material";
import { useHuggingFaceStore } from "../stores/HuggingFaceStore";

const styles = (theme: any) =>
  css({
    "&": {
      backgroundColor: theme.palette.c_gray1,
      padding: theme.spacing(2),
      marginBottom: "1em"
    },
    ".download-button": {
      margin: ".1em 0 1em 0",
      lineHeight: "1.2em",
      color: theme.palette.c_gray0
    },
    ".download-info": {
      color: theme.palette.c_warning
    }
  });

const HuggingFaceModelDownloader: React.FC = () => {
  const [repoId, setRepoId] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const downloads = useHuggingFaceStore((state) => state.downloads);
  const startDownload = useHuggingFaceStore((state) => state.startDownload);
  const cancelDownload = useHuggingFaceStore((state) => state.cancelDownload);

  const searchModels = async (query: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `https://huggingface.co/api/models?search=${query}`
      );
      const data = await response.json();
      setOptions(data.map((model: any) => model.id));
    } catch (error) {
      setError("Error searching models");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (repoId && !(repoId in downloads)) {
      startDownload(repoId);
      setRepoId(null);
      setError(null);
    }
  };

  return (
    <Box className="huggingface-model-downloader" css={styles}>
      <Typography variant="h5">Download Models</Typography>
      {error && <Typography color="error">{error}</Typography>}
      <form onSubmit={handleSubmit}>
        <Autocomplete
          value={repoId}
          onChange={(event, newValue) => {
            setRepoId(newValue);
          }}
          onInputChange={(event, newInputValue) => {
            setRepoId(newInputValue);
            if (newInputValue.length > 2) {
              searchModels(newInputValue);
            }
          }}
          options={options}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Search HuggingFace by Repo ID"
              variant="filled"
              fullWidth
            /* margin="filled" */
            />
          )}
          freeSolo
          loading={isLoading}
          loadingText="Searching..."
        />
        <Button
          className="download-button"
          type="submit"
          variant="contained"
          color="primary"
          disabled={!repoId}
        >
          {repoId ? (
            <>
              Download
              <br />
              {repoId}
            </>
          ) : (
            "Download selected model"
          )}
        </Button>
        {repoId && (
          <Typography className="download-info" variant="body2">
            The model will be downloaded to your HuggingFace cache folder in the
            background.
          </Typography>
        )}
      </form>

      {Object.entries(downloads).map(([name, download]) => (
        <Box key={name} mt={2}>
          <Typography variant="subtitle1">{name}</Typography>
          <LinearProgress
            variant="determinate"
            value={(download.downloadedBytes * 1.0 / download.totalBytes) * 100}
          />
          <Typography variant="body2">
            {download.totalFiles && download.downloadedFiles && (
              <> | Files: {download.downloadedFiles} / {download.totalFiles}</>
            )}
            {download.downloadedBytes && download.totalBytes && (
              <> | Size: {(download.downloadedBytes / 1024 / 1024).toFixed(2)} MB / {(download.totalBytes / 1024 / 1024).toFixed(2)} MB</>
            )}
          </Typography>
          {download.message && (
            <Typography variant="body2">Message: {download.message}</Typography>
          )}
          {download.status === 'running' && (
            <Button onClick={() => cancelDownload(name)} variant="outlined" color="secondary" size="small">
              Cancel
            </Button>
          )}
        </Box>
      ))}
    </Box>
  );
};

export default HuggingFaceModelDownloader;
