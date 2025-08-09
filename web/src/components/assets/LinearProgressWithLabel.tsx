import React from "react";
import { Box, LinearProgress, LinearProgressProps, Typography } from "@mui/material";

type LinearProgressWithLabelProps = LinearProgressProps & {
    filename?: string,
    value: number
}

export function LinearProgressWithLabel(props: LinearProgressWithLabelProps) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {props.filename && (
                <Box sx={{ width: '50%' }}>
                    <Typography variant="body2" color="text.primary">
                        {props.filename}
                    </Typography>
                </Box>
            )}
            <Box sx={{ width: props.filename ? '50%' : '100%', mr: 1 }}>
                <LinearProgress variant="determinate" {...props} />
            </Box>
            <Box sx={{ minWidth: 35 }}>
                <Typography variant="body2" color="text.secondary">{`${Math.round(
                    props.value,
                )}%`}</Typography>
            </Box>
        </Box>
    );
}

export default LinearProgressWithLabel;