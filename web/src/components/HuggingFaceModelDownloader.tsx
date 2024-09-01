import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BASE_URL } from "../stores/ApiClient";
import {
  Button,
  TextField,
  LinearProgress,
  Typography,
  Box,
  Autocomplete,
} from "@mui/material";

interface DownloadProgress {
  progress: number;
  desc: string;
  current: number;
  total: number;
}

const HuggingFaceModelDownloader: React.FC = () => {
  const [repoId, setRepoId] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Record<string, DownloadProgress>>(
    {}
  );
  const [options, setOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const downloadMutation = useMutation({
    mutationFn: async (repoId: string) => {
      const response = await fetch(
        BASE_URL + "/api/models/download?repo_id=" + repoId,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        throw new Error("Download failed");
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (line.trim()) {
            const progress: DownloadProgress = JSON.parse(line);
            setDownloads((prevDownloads) => {
              return {
                ...prevDownloads,
                repoId: progress,
              };
            });
          }
        }
      }
    },
  });

  const searchModels = async (query: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `https://huggingface.co/api/models?search=${query}`
      );
      const data = await response.json();
      setOptions(data.map((model: any) => model.id));
    } catch (error) {
      console.error("Error fetching models:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (repoId && !downloads[repoId]) {
      downloadMutation.mutate(repoId);
      setRepoId("");
    }
  };

  return (
    <Box className="huggingface-model-downloader">
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
              label="Hugging Face Repo ID to download"
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
          type="submit"
          variant="contained"
          color="primary"
          disabled={downloadMutation.isPending || !repoId}
        >
          Start Downloading this model
        </Button>
      </form>

      {repoId && downloads[repoId] && (
        <Box key={repoId} mt={2}>
          <Typography variant="subtitle1">{repoId}</Typography>
          <LinearProgress
            variant="determinate"
            value={downloads[repoId].progress}
          />
          <Typography variant="body2">
            {downloads[repoId].desc} - {downloads[repoId].current} /{" "}
            {downloads[repoId].total}
          </Typography>
        </Box>
      )}

      {downloadMutation.isError && (
        <Typography color="error" mt={2}>
          Error: {downloadMutation.error.message}
        </Typography>
      )}
    </Box>
  );
};

export default HuggingFaceModelDownloader;
