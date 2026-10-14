import { memo } from "react";
import { StatusPill } from "../ui_primitives";
import { exampleNeedsLabel, type ExampleNeeds } from "../../utils/exampleNeeds";

interface ExampleNeedsPillProps {
  /** What the example asks for. Nothing renders when it is unknown. */
  needs: ExampleNeeds | null | undefined;
}

/** "Runs as is", or the model or key an example card needs before it runs. */
const ExampleNeedsPill = ({ needs }: ExampleNeedsPillProps) => {
  if (!needs) {
    return null;
  }
  const { label, runsAsIs } = exampleNeedsLabel(needs);
  return (
    <StatusPill
      tone={runsAsIs ? "done" : "neutral"}
      data-testid="example-needs"
      sx={{ alignSelf: "flex-start" }}
    >
      {label}
    </StatusPill>
  );
};

export default memo(ExampleNeedsPill);
