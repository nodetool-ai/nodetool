import { memo } from "react";
import type { LinearProgressProps } from "../ui_primitives";
import { ProgressBar } from "../ui_primitives";

type LinearProgressWithLabelProps = LinearProgressProps & {
    filename?: string,
    value: number
}

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
