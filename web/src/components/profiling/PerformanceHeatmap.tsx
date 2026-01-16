/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Box, Tooltip, Typography } from "@mui/material";
import { memo, useMemo } from "react";
import useWorkflowPerformance from "../../hooks/profiling/useWorkflowPerformance";

const styles = {
  container: css`
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 10;
  `,
  heatmapOverlay: css`
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  `,
  legend: css`
    position: absolute;
    bottom: 16px;
    right: 16px;
    background-color: rgba(255, 255, 255, 0.95);
    padding: 12px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  legendTitle: css`
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 4px;
  `,
  legendItem: css`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
  `,
  legendColor: css`
    width: 16px;
    height: 16px;
    border-radius: 4px;
  `
};

interface PerformanceHeatmapProps {
  showLegend?: boolean;
}

const PerformanceHeatmap: React.FC<PerformanceHeatmapProps> = memo(({ showLegend = true }) => {
  const { profile, formatDuration } = useWorkflowPerformance();

  const nodeOverlays = useMemo(() => {
    if (!profile) {
      return [];
    }

    return profile.nodes.map(node => {
      const percentage = node.percentageOfTotal;
      let backgroundColor = "rgba(76, 175, 80, 0.1)";

      if (node.isBottleneck) {
        backgroundColor = "rgba(244, 67, 54, 0.2)";
      } else if (percentage >= 10) {
        backgroundColor = "rgba(255, 152, 0, 0.15)";
      } else if (percentage >= 5) {
        backgroundColor = "rgba(255, 193, 7, 0.12)";
      }

      return {
        nodeId: node.nodeId,
        backgroundColor,
        label: node.nodeName,
        duration: node.duration,
        percentage,
        isBottleneck: node.isBottleneck
      };
    });
  }, [profile]);

  if (!profile || nodeOverlays.length === 0) {
    return null;
  }

  const legendItems = [
    { color: "rgba(244, 67, 54, 0.2)", label: "Bottleneck (≥20%)" },
    { color: "rgba(255, 152, 0, 0.15)", label: "High (10-20%)" },
    { color: "rgba(255, 193, 7, 0.12)", label: "Medium (5-10%)" },
    { color: "rgba(76, 175, 80, 0.1)", label: "Low (<5%)" }
  ];

  return (
    <Box css={styles.container}>
      <Box css={styles.heatmapOverlay}>
        {nodeOverlays.map(overlay => (
          <Tooltip
            key={overlay.nodeId}
            title={
              <Box>
                <Typography variant="body2" fontWeight={600}>{overlay.label}</Typography>
                <Typography variant="caption">
                  Duration: {formatDuration(overlay.duration)} ({overlay.percentage.toFixed(1)}%)
                </Typography>
                {overlay.isBottleneck && (
                  <Typography variant="caption" display="block" color="error">
                    ⚠️ Performance Bottleneck
                  </Typography>
                )}
              </Box>
            }
            arrow
          >
            <Box
              data-node-id={overlay.nodeId}
              css={css`
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: ${overlay.backgroundColor};
                border: 2px solid ${overlay.isBottleneck ? 'rgba(244, 67, 54, 0.5)' : 'transparent'};
                border-radius: 8px;
                pointer-events: auto;
                cursor: help;
                transition: background-color 0.3s ease;
              `}
            />
          </Tooltip>
        ))}
      </Box>

      {showLegend && (
        <Box css={styles.legend}>
          <Typography variant="caption" css={styles.legendTitle}>Execution Time Heatmap</Typography>
          {legendItems.map((item, index) => (
            <Box key={index} css={styles.legendItem}>
              <Box css={styles.legendColor} style={{ backgroundColor: item.color }} />
              <Typography variant="caption">{item.label}</Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
});

PerformanceHeatmap.displayName = "PerformanceHeatmap";

export default PerformanceHeatmap;
