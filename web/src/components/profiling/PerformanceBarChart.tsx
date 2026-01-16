/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Box, Typography, useTheme } from "@mui/material";
import { memo } from "react";

interface BarChartData {
  label: string;
  value: number;
  percentage: number;
  isBottleneck: boolean;
}

interface PerformanceBarChartProps {
  data: BarChartData[];
  formatDuration: (ms: number) => string;
}

const styles = {
  container: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 0;
  `,
  barRow: css`
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  label: css`
    min-width: 80px;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
  `,
  barContainer: css`
    flex: 1;
    height: 20px;
    background-color: rgba(0, 0, 0, 0.08);
    border-radius: 4px;
    overflow: hidden;
  `,
  bar: css`
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  `,
  value: css`
    min-width: 50px;
    text-align: right;
    font-size: 11px;
    font-weight: 500;
  `,
  percentage: css`
    min-width: 35px;
    text-align: right;
    font-size: 10px;
    color: rgba(0, 0, 0, 0.6);
  `
};

const PerformanceBarChart: React.FC<PerformanceBarChartProps> = memo(({ data, formatDuration }) => {
  const theme = useTheme();

  if (data.length === 0) {
    return null;
  }

  const maxValue = Math.max(...data.map(d => d.value));

  const getBarColor = (isBottleneck: boolean, percentage: number): string => {
    if (isBottleneck) {
      return theme.palette.error.main;
    } else if (percentage >= 10) {
      return theme.palette.warning.main;
    } else if (percentage >= 5) {
      return theme.palette.info.main;
    }
    return theme.palette.success.main;
  };

  return (
    <Box css={styles.container}>
      {data.map((item, index) => {
        const barWidth = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
        const barColor = getBarColor(item.isBottleneck, item.percentage);

        return (
          <Box key={index} css={styles.barRow}>
            <Typography
              component="span"
              variant="caption"
              css={styles.label}
              title={item.label}
            >
              {item.label}
            </Typography>
            <Box css={styles.barContainer}>
              <Box
                css={styles.bar}
                style={{
                  width: `${barWidth}%`,
                  backgroundColor: barColor
                }}
              />
            </Box>
            <Typography
              component="span"
              variant="caption"
              css={styles.value}
            >
              {formatDuration(item.value)}
            </Typography>
            <Typography
              component="span"
              variant="caption"
              css={styles.percentage}
            >
              {item.percentage.toFixed(1)}%
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
});

PerformanceBarChart.displayName = "PerformanceBarChart";

export default PerformanceBarChart;
