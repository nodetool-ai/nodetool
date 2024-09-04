/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState } from "react";
import { TextField, Autocomplete, Typography, Button } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useHuggingFaceStore } from "../../stores/HuggingFaceStore";

interface HuggingFaceModelSearchProps {}

const searchModels = async (query: string) => {
  if (query.length < 2) {
    return [];
  }
  const response = await fetch(
    `https://huggingface.co/api/models?search=${query}`
  );
  if (!response.ok) {
    throw new Error("Failed to fetch models");
  }
  const data = await response.json();
  return data.map((model: any) => model.id);
};

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

const HuggingFaceModelSearch: React.FC<HuggingFaceModelSearchProps> = () => {
  const [repoId, setRepoId] = useState<string>("");
  const { startDownload, openDialog } = useHuggingFaceStore();

  const { data, isLoading, error } = useQuery({
    queryKey: ["huggingface-models", repoId],
    queryFn: () => searchModels(repoId)
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // get allow list from backend
    startDownload(repoId, null, null);
    openDialog();
  };

  return (
    <form onSubmit={handleSubmit} css={styles}>
      {error && <Typography color="error">{error.message}</Typography>}
      <Autocomplete
        value={repoId}
        onChange={(event, newValue) => {
          setRepoId(newValue || "");
        }}
        onInputChange={(event, newInputValue) => {
          setRepoId(newInputValue);
        }}
        options={data || []}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Search HuggingFace by Repo ID"
            variant="filled"
            fullWidth
            /* margin="filled" */
          />
        )}
        // freeSolo
        loading={isLoading}
        loadingText="Searching..."
      />
      <Button
        type="submit"
        variant="contained"
        color="primary"
        disabled={repoId === ""}
        style={{ marginTop: "1rem" }}
      >
        Download
      </Button>
    </form>
  );
};

export default HuggingFaceModelSearch;
