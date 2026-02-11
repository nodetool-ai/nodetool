import React, { memo, useMemo } from "react";
import { Box, LinearProgress, LinearProgressProps, Typography } from "@mui/material";

type LinearProgressWithLabelProps = LinearProgressProps & {
    filename?: string,
    value: number
}

/**
 * Memoized linear progress component with filename and percentage display.
 * Optimized to prevent unnecessary re-renders during file upload operations.
 */
export const LinearProgressWithLabel = memo(function LinearProgressWithLabel(props: LinearProgressWithLabelProps) {
    const { filename, value, ...linearProgressProps } = props;

    // Memoize the container style to avoid creating new objects on each render
    const containerStyle = useMemo(() => ({ display: 'flex', alignItems: 'center' }), []);

    // Memoize filename box style
    const filenameBoxStyle = useMemo(() => ({ width: '50%' }), []);

    // Memoize progress box style - depends on whether filename is shown
    const progressBoxStyle = useMemo(() => ({
        width: filename ? '50%' : '100%',
        mr: 1
    }), [filename]);

    // Memoize percentage box style
    const percentageBoxStyle = useMemo(() => ({ minWidth: 35 }), []);

    return (
        <Box sx={containerStyle}>
            {filename && (
                <Box sx={filenameBoxStyle}>
                    <Typography variant="body2" color="text.primary">
                        {filename}
                    </Typography>
                </Box>
            )}
            <Box sx={progressBoxStyle}>
                <LinearProgress variant="determinate" value={value ?? 0} {...linearProgressProps} />
            </Box>
            <Box sx={percentageBoxStyle}>
                <Typography variant="body2" color="text.secondary">{`${Math.round(
                    value,
                )}%`}</Typography>
            </Box>
        </Box>
    );
});

export default LinearProgressWithLabel;