/**
 * Step 2a of the image flow — what the picture is for (PRD § 10.2).
 *
 * Picking a card writes three defaults onto the document: the use case itself,
 * the canvas size it starts from, and how many variations that kind of picture
 * is usually worth. Every one of them is still editable later, which is why
 * this is a card grid and not a form.
 */

import React, { memo, useCallback } from "react";

import { FlexColumn, GAP, Text } from "../../ui_primitives";
import { useSketchStore } from "../../sketch/state/useSketchStore";
import { OptionCardGrid } from "../OptionCardGrid";
import { USE_CASE_CARDS, findUseCase } from "./useCases";

const UseCaseStepInternal: React.FC = () => {
  const useCaseId = useSketchStore(
    (state) => state.document.setup?.use_case ?? null
  );
  const setSetup = useSketchStore((state) => state.setSetup);
  const resizeCanvas = useSketchStore((state) => state.resizeCanvas);

  const handleSelect = useCallback(
    (id: string) => {
      const useCase = findUseCase(id);
      if (!useCase) {
        return;
      }
      setSetup({ use_case: id, variations: useCase.defaultVariations });
      resizeCanvas(useCase.defaultSize.width, useCase.defaultSize.height);
    },
    [resizeCanvas, setSetup]
  );

  return (
    <FlexColumn gap={GAP.spacious}>
      <Text size="big" component="h2">
        What is it for?
      </Text>
      <OptionCardGrid
        label="Use case"
        options={USE_CASE_CARDS}
        selectedId={useCaseId}
        onSelect={handleSelect}
      />
    </FlexColumn>
  );
};

export const UseCaseStep = memo(UseCaseStepInternal);
UseCaseStep.displayName = "UseCaseStep";

export default UseCaseStep;
