/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useState } from "react";
import { BASE_URL } from "../stores/ApiClient";
import {
  Button,
  TextField,
  Typography,
  Box,
  Autocomplete
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
  const addDownload = useHuggingFaceStore((state) => state.addDownload);
  const updateDownload = useHuggingFaceStore((state) => state.updateDownload);

  const startDownload = useCallback(
    (repoId: string) => {
      const ws = new WebSocket(`${BASE_URL}/hf/download?repo_id=${repoId}`);
      addDownload(repoId, { ws, output: "" });

      ws.onmessage = (event: MessageEvent) => {
        updateDownload(repoId, event.data);
      };

      ws.onerror = () => {
        setError("WebSocket connection error");
      };

      ws.onclose = () => {
        console.log("WebSocket connection closed");
      };
    },
    [addDownload, updateDownload]
  );

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

      {Object.keys(downloads).length > 0 && (
        <Typography variant="h5">Downloads</Typography>
      )}

      {Object.keys(downloads).map((name) => (
        <Box key={name} mt={2} style={{ overflow: "scroll" }}>
          <Typography variant="subtitle1">{name}</Typography>
          <pre
            style={{
              padding: "5px",
              whiteSpace: "pre-wrap",
              fontFamily: "monospace",
              fontSize: "9px",
              border: "1px solid grey",
              background: "black"
            }}
          >
            {downloads[name].output}
          </pre>
        </Box>
      ))}
    </Box>
  );
};

export default HuggingFaceModelDownloader;
