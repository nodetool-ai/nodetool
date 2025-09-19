import React from "react";
import { Typography } from "@mui/material";

import OutputRenderer from "../../node/OutputRenderer";
import { MiniAppResult } from "../types";

interface MiniAppResultsProps {
  results: MiniAppResult[];
}

const MiniAppResults: React.FC<MiniAppResultsProps> = ({ results }) => {
  const hasResults = results.length > 0;

  return (
    <section className="results-shell glass-card">
      <div className="results-heading">
        {hasResults && (
          <Typography variant="body2" color="text.secondary">
            {results.length} {results.length === 1 ? "result" : "results"}
          </Typography>
        )}
      </div>

      {hasResults ? (
        <div className="results-list">
          {results.map((result) => (
            <div className="result-card" key={result.id}>
              <div className="result-card-header">
                <Typography variant="subtitle2">
                  {result.nodeName || result.outputName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {result.outputName}
                </Typography>
              </div>
              <div className="result-card-body">
                <OutputRenderer value={result.value} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="result-placeholder">
          <Typography
            className="empty-eyebrow"
            variant="overline"
            color="text.secondary"
          >
            No results
          </Typography>
        </div>
      )}
    </section>
  );
};

export default MiniAppResults;
