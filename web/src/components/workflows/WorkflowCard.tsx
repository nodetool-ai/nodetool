/** @jsxImportSource @emotion/react */
import {
  Box,
  Typography,
  CircularProgress,
  Fade,
  Tooltip
} from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import { BASE_URL } from "../../stores/ApiClient";
import { getNodeDisplayName, getNodeNamespace } from "../../utils/nodeDisplay";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

interface WorkflowCardProps {
  workflow: Workflow;
  matchedNodes: { text: string }[];
  nodesOnlySearch: boolean;
  isLoading: boolean;
  onClick: (workflow: Workflow) => void;
}

const WorkflowCard: React.FC<WorkflowCardProps> = ({
  workflow,
  matchedNodes,
  nodesOnlySearch,
  isLoading,
  onClick
}) => {
  return (
    <Box
      className={`workflow ${isLoading ? "loading" : ""}`}
      onClick={() => onClick(workflow)}
    >
      {isLoading && (
        <Fade in={true}>
          <Box className="loading-overlay">
            <CircularProgress size={40} color="secondary" />
            <Typography className="loading-text">
              Creating new workflow from example...
            </Typography>
          </Box>
        </Fade>
      )}
      <Typography variant="h3" component={"h3"}>
        {workflow.name}
      </Typography>
      <Box className="image-wrapper">
        <img
          width="200px"
          src={
            BASE_URL +
            "/api/assets/packages/" +
            workflow.package_name +
            "/" +
            workflow.name +
            ".jpg"
          }
          alt={" "}
        />
        <Tooltip
          title={
            <>
              <span>
                <b>PACKAGE NAME</b>
              </span>
              <br />
              <span>{workflow.package_name || ""}</span>
            </>
          }
          enterDelay={TOOLTIP_ENTER_DELAY * 4}
          enterNextDelay={TOOLTIP_ENTER_DELAY * 4}
          placement="right"
          slotProps={{
            tooltip: {
              sx: {
                display: "inline-block",

                fontSize: "var(--fontSizeSmaller) !important"
              }
            }
          }}
        >
          <Typography className="package-name" component={"p"}>
            {workflow.package_name?.replace("nodetool-", "")?.toUpperCase() ||
              "N/A"}
          </Typography>
        </Tooltip>
        {nodesOnlySearch && matchedNodes.length > 0 && (
          <Box
            className="matched-nodes"
            sx={{ mt: 1, display: "flex", gap: 0.5, flexWrap: "wrap" }}
          >
            {matchedNodes.map((match, idx) => (
              <Typography key={idx} className="matched-item">
                {getNodeDisplayName(match.text) && (
                  <>
                    <span className="matched-item-name">
                      {getNodeDisplayName(match.text)}
                    </span>
                  </>
                )}
                <span className="matched-item-namespace">
                  {getNodeNamespace(match.text)}
                </span>
              </Typography>
            ))}
          </Box>
        )}
      </Box>

      <Typography className="description">{workflow.description}</Typography>
    </Box>
  );
};

export default WorkflowCard;
