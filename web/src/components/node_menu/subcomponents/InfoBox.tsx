import React, { memo } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { NodeMetadata } from "../../../stores/ApiTypes";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_LEAVE_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../../config/constants";

interface Props {
  searchTerm: string;
  minSearchTermLength: number;
  selectedPathString: string;
  searchResults: NodeMetadata[];
  allSearchMatches: NodeMetadata[];
  metadata: NodeMetadata[];
  totalNodes: number;
}

const InfoBox: React.FC<Props> = ({
  searchTerm,
  minSearchTermLength,
  selectedPathString,
  searchResults,
  allSearchMatches,
  metadata,
  totalNodes
}) => (
  <Box className="info-box">
    <Tooltip
      title={
        <div style={{ color: "#eee", fontSize: "1.25em" }}>
          {selectedPathString && (
            <div>Current namespace: {searchResults?.length} nodes</div>
          )}
          {searchTerm.length > minSearchTermLength ? (
            <>
              <div>Total search matches: {allSearchMatches.length}</div>
              <div
                style={{
                  fontSize: "0.8em",
                  color: "#aaa",
                  marginTop: "0.5em"
                }}
              ></div>
            </>
          ) : (
            <>
              <div>Total available: {totalNodes} nodes</div>
              <div
                style={{
                  fontSize: "0.8em",
                  color: "#aaa",
                  marginTop: "0.5em"
                }}
              ></div>
            </>
          )}
        </div>
      }
      enterDelay={TOOLTIP_ENTER_DELAY}
      leaveDelay={TOOLTIP_LEAVE_DELAY}
      enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
      placement="bottom"
    >
      <Typography className="result-info">
        {searchTerm.length > minSearchTermLength ? (
          <>
            <span>{searchResults.length}</span> / <span>{searchTerm.length > minSearchTermLength ? allSearchMatches.length : metadata.length}</span>
          </>
        ) : (
          <span>{selectedPathString ? searchResults.length : totalNodes}</span>
        )}
        <span className="result-label">nodes</span>
      </Typography>
    </Tooltip>
  </Box>
);

export default memo(InfoBox);
