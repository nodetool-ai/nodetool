import React, { useMemo } from "react";
import { Link } from "@mui/material";
import { CloseButton, Dialog, FlexRow, Text } from "../ui_primitives";
import { useQuery } from "@tanstack/react-query";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { useTheme } from "@mui/material/styles";

interface ReadmeDialogProps {
  open: boolean;
  onClose: () => void;
  modelId: string;
}

const getReadmeUrl = (modelId: string) => {
  const [org, model] = modelId.split("/");
  return `https://huggingface.co/${org}/${model}/raw/main/README.md`;
};

const fetchModelReadme = async (modelId: string) => {
  const response = await fetch(getReadmeUrl(modelId));
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
    enabled: open
  });

  const theme = useTheme();

  const formattedReadme = useMemo(() => {
    const lines = readmeData?.split("\n");
    const start = lines?.findIndex((line) => line.startsWith("#"));
    if (start == null || start === -1) {
      return "";
    }
    return lines?.slice(start).join("\n");
  }, [readmeData]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        <FlexRow justify="space-between" align="center" fullWidth>
          <Text size="big" weight={600}>
            README
          </Text>
          <CloseButton onClick={onClose} tooltip="Close" />
        </FlexRow>
      }
      maxWidth="md"
      fullWidth
      slotProps={{
        backdrop: {
          style: {
            backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.8)`
          }
        }
      }}
    >
      {formattedReadme ? (
        <MarkdownRenderer content={formattedReadme} isReadme={true} />
      ) : (
        <Text>
          No README available found at{" "}
          <Link
            className="readme-link"
            style={{ color: theme.vars.palette.c_link }}
            target="_blank"
            href={`https://huggingface.co/${modelId}/raw/main/README.md`}
            rel="noreferrer"
          >
            {`https://huggingface.co/${modelId}/raw/main/README.md`}
          </Link>
        </Text>
      )}
    </Dialog>
  );
};

export default ReadmeDialog;
