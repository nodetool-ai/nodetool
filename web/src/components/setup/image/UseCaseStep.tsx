/**
 * Step 2a of the image flow — what the picture is for (PRD § 10.2).
 *
 * Picking a card writes three defaults onto the document: the use case itself,
 * the canvas size it starts from, and how many variations that kind of picture
 * is usually worth. Every one of them is still editable later, which is why
 * this is a card grid and not a form.
 */

import React, { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { FlexColumn, GAP, Text } from "../../ui_primitives";
import { useSketchStore } from "../../sketch/state/useSketchStore";
import { OptionCardGrid } from "../OptionCardGrid";
import { USE_CASE_CARDS, findUseCase } from "./useCases";

const UseCaseStepInternal: React.FC = () => {
  const { t } = useTranslation();
  const useCaseId = useSketchStore(
    (state) => state.document.setup?.use_case ?? null
  );
  const setSetup = useSketchStore((state) => state.setSetup);
  const resizeCanvas = useSketchStore((state) => state.resizeCanvas);
  const options = useMemo(
    () =>
      USE_CASE_CARDS.map((card) => ({
        ...card,
        title: t(`pass3_8.image.useCase.cards.${card.id}.title`),
        description: t(`pass3_8.image.useCase.cards.${card.id}.description`)
      })),
    [t]
  );

  const handleSelect = useCallback(
    (id: string) => {
      const useCase = findUseCase(id);
      if (!useCase || id === useCaseId) {
        // Re-picking the card already chosen is not a change, so the count and
        // the canvas the creator has since adjusted stay as they are (F15).
        return;
      }
      setSetup({ use_case: id, variations: useCase.defaultVariations });
      resizeCanvas(useCase.defaultSize.width, useCase.defaultSize.height);
    },
    [resizeCanvas, setSetup, useCaseId]
  );

  return (
    <FlexColumn gap={GAP.spacious}>
      <Text size="big" component="h2">
        {t("pass3_8.image.useCase.heading")}
      </Text>
      <OptionCardGrid
        label={t("pass3_8.image.useCase.groupLabel")}
        options={options}
        selectedId={useCaseId}
        onSelect={handleSelect}
      />
    </FlexColumn>
  );
};

export const UseCaseStep = memo(UseCaseStepInternal);
UseCaseStep.displayName = "UseCaseStep";

export default UseCaseStep;
