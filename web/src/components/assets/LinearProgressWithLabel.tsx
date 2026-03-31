import { memo } from "react";
import { LinearProgressProps } from "@mui/material";
import { ProgressBar } from "../ui_primitives/ProgressBar";

type LinearProgressWithLabelProps = LinearProgressProps & {
    filename?: string,
    value: number
}

/**
 * Memoized linear progress component with filename and percentage display.
 * Optimized to prevent unnecessary re-renders during file upload operations.
 *
 * Now wraps the ProgressBar UI primitive.
 */
export const LinearProgressWithLabel = memo(function LinearProgressWithLabel(props: LinearProgressWithLabelProps) {
    const { filename, value, ...rest } = props;

    return (
        <ProgressBar
            value={value ?? 0}
            label={filename}
            showValue={true}
            progressVariant="determinate"
            {...rest}
        />
    );
});

export default LinearProgressWithLabel;
