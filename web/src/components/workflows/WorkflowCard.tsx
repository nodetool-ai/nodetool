/** @jsxImportSource @emotion/react */
import {
  Box,
  Typography,
  CircularProgress,
  Fade,
  Tooltip,
  useTheme,
  Chip
} from "@mui/material";
import { chipsContainerSx, chipSx } from "./WorkflowCard.styles";
import { Workflow } from "../../stores/ApiTypes";
import { BASE_URL } from "../../stores/BASE_URL";
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
  const theme = useTheme();
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

      {/* Required providers/models chips */}
      <Box sx={chipsContainerSx}>
        {Array.isArray((workflow as any).required_providers) &&
          (workflow as any).required_providers.map((prov: string) => (
            <Chip
              key={`prov-${prov}`}
              label={prov}
              title={prov}
              size="small"
              variant="outlined"
              sx={chipSx(theme, "secondary")}
            />
          ))}

        {Array.isArray((workflow as any).required_models) &&
          (workflow as any).required_models
            .slice(0, 4)
            .map((model: string) => (
              <Chip
                key={`model-${model}`}
                label={model}
                title={model}
                size="small"
                variant="outlined"
                sx={chipSx(theme, "primary")}
              />
            ))}

        {Array.isArray((workflow as any).required_models) &&
          (workflow as any).required_models.length > 4 && (
            <Chip
              label={`+${(workflow as any).required_models.length - 4} more`}
              size="small"
              variant="outlined"
              sx={chipSx(theme, "info", { uppercase: false })}
            />
          )}
      </Box>
    </Box>
  );
};

export default WorkflowCard;
