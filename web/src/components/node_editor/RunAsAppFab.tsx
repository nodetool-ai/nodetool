import { Fab, Tooltip } from "@mui/material";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import { useNavigate } from "react-router-dom";

interface RunAsAppFabProps {
  workflowId: string;
}

const RunAsAppFab = ({ workflowId }: RunAsAppFabProps) => {
  const navigate = useNavigate();

  return (
    <Tooltip title="Run as App" placement="left">
      <Fab
        size="medium"
        onClick={() => navigate(`/apps/${workflowId}`)}
        sx={{
          position: "absolute",
          top: 10,
          right: 50,
          zIndex: 100,
          background: "linear-gradient(90deg, #3F51B5 0%, #2196F3 100%)",
          color: "white",
          boxShadow: "0 4px 14px rgba(33, 150, 243, 0.3)",
          "&:hover": {
            background: "linear-gradient(90deg, #303F9F 0%, #1976D2 100%)",
            boxShadow: "0 6px 20px rgba(33, 150, 243, 0.4)",
            transform: "scale(1.05)"
          },
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
        }}
      >
        <RocketLaunchIcon />
      </Fab>
    </Tooltip>
  );
};

export default RunAsAppFab;
