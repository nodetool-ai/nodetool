import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BASE_URL } from "../stores/ApiClient";
import {
  Button,
  TextField,
  LinearProgress,
  Typography,
  Box,
} from "@mui/material";

interface DownloadProgress {
  progress: number;
  desc: string;
  current: number;
  total: number;
}

const HuggingFaceModelDownloader: React.FC = () => {
  const [repoId, setRepoId] = useState("");
  const [downloads, setDownloads] = useState<Record<string, DownloadProgress>>(
    {}
  );

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (repoId && !downloads[repoId]) {
      downloadMutation.mutate(repoId);
      setRepoId("");
    }
  };

  return (
    <Box>
      <form onSubmit={handleSubmit}>
        <TextField
          value={repoId}
          onChange={(e) => setRepoId(e.target.value)}
          label="Hugging Face Repo ID to download"
          variant="outlined"
          fullWidth
          margin="normal"
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

      {downloads[repoId] && (
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
