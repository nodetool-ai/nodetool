/** @jsxImportSource @emotion/react */
import { Button, Tooltip } from "@mui/material";
import BlockIcon from "@mui/icons-material/Block";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

interface BypassGroupButtonProps {
  isBypassed: boolean;
  onClick: () => void;
}

const BypassGroupButton: React.FC<BypassGroupButtonProps> = ({
  isBypassed,
  onClick
}) => {
  return (
    <Tooltip
      title={
        <div
          className="tooltip-span"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.1em"
          }}
        >
          <span style={{ fontSize: "1.2em", color: "white" }}>
            {isBypassed ? "Enable All Nodes" : "Bypass All Nodes"}
          </span>
          <span style={{ fontSize: ".9em", color: "white" }}>
            <kbd>B</kbd>
          </span>
        </div>
      }
      enterDelay={TOOLTIP_ENTER_DELAY}
    >
      <Button
        size="large"
        tabIndex={-1}
        className={`action-button bypass-group-button ${isBypassed ? "bypassed" : ""}`}
        onClick={onClick}
      >
        {isBypassed ? <PlayArrowIcon /> : <BlockIcon />}
      </Button>
    </Tooltip>
  );
};

export default BypassGroupButton;

