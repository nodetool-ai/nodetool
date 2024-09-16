import React, { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useQuery } from "@tanstack/react-query";
import MarkdownRenderer from "../../utils/MarkdownRenderer";

interface ReadmeDialogProps {
  open: boolean;
  onClose: () => void;
  modelId: string;
}

const fetchModelReadme = async (modelId: string) => {
  const response = await fetch(
    `https://huggingface.co/${modelId}/raw/main/README.md`
  );
  if (response.ok) {
    return response.text();
  }
  return null;
};

const ReadmeDialog: React.FC<ReadmeDialogProps> = ({
  open,
  onClose,
  modelId
}) => {
  const { data: readmeData } = useQuery({
    queryKey: ["readme", modelId],
    queryFn: () => fetchModelReadme(modelId),
    refetchOnWindowFocus: false,
    gcTime: 1000 * 60 * 60 * 24,
    enabled: open // Only fetch when the dialog is open
  });

  const formattedReadme = useMemo(() => {
    const lines = readmeData?.split("\n");
    const start = lines?.findIndex((line) => line.startsWith("#"));
    if (!start || start === -1) return "";
    return lines?.slice(start).join("\n");
  }, [readmeData]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        README
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {formattedReadme ? (
          <MarkdownRenderer content={formattedReadme} isReadme={true} />
        ) : (
          <Typography>No README available</Typography>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ReadmeDialog;
