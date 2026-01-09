import { Fab, Tooltip } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useNodeSelectionTemplate } from "../../hooks/useNodeSelectionTemplate";

const TemplateBrowserFab = () => {
  const { setTemplateBrowserOpen } = useNodeSelectionTemplate();

  return (
    <Tooltip title="Templates (Ctrl+E)" placement="left">
      <Fab
        size="medium"
        onClick={() => setTemplateBrowserOpen(true)}
        sx={{
          borderRadius: 0,
          position: "fixed",
          top: "80px",
          right: "0px",
          width: "48px !important",
          height: "32px !important",
          zIndex: 100,
          background: "linear-gradient(90deg, #FF9800 0%, #FFC107 100%)",
          color: "white",
          boxShadow: "0 4px 14px rgba(255, 193, 7, 0.3)",
          "&:hover": {
            background: "linear-gradient(90deg, #F57C00 0%, #FFA000 100%)",
            boxShadow: "0 6px 20px rgba(255, 193, 7, 0.4)",
            transform: "scale(1.05)"
          },
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
        }}
      >
        <ContentCopyIcon />
      </Fab>
    </Tooltip>
  );
};

export default TemplateBrowserFab;
