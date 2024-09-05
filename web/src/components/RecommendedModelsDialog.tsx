import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button
} from "@mui/material";
import { HuggingFaceModel } from "../stores/ApiTypes";

interface RecommendedModelsDialogProps {
  open: boolean;
  onClose: () => void;
  recommendedModels: HuggingFaceModel[];
  startDownload: (
    repoId: string,
    allowPatterns: string[] | null,
    ignorePatterns: string[] | null
  ) => void;
  openDialog: () => void;
}

const RecommendedModelsDialog: React.FC<RecommendedModelsDialogProps> = ({
  open,
  onClose,
  recommendedModels,
  startDownload,
  openDialog
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Recommended Models</DialogTitle>
      <DialogContent>
        <Grid container spacing={2}>
          {recommendedModels.map((model) => (
            <Grid item xs={12} sm={6} md={4} key={model.repo_id}>
              <Card>
                <CardContent>
                  <Typography variant="h6" component="div">
                    {model.repo_id}
                  </Typography>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => {
                      startDownload(
                        model.repo_id ?? "",
                        model.allow_patterns ?? null,
                        model.ignore_patterns ?? null
                      );
                      openDialog();
                      onClose();
                    }}
                  >
                    Download
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      </DialogContent>
    </Dialog>
  );
};

export default RecommendedModelsDialog;
