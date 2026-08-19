import React, { useCallback } from "react";
import { Chip, FlexRow, Text, Tooltip } from "../../ui_primitives";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import { MODEL_GOALS } from "./modelFit";

/**
 * "What do you want to do?" filter row: one chip per goal, narrowing the model
 * list to models that serve it. Clicking the active chip clears the filter.
 */
const GoalFilterChips: React.FC = () => {
  const selectedGoal = useModelManagerStore((state) => state.selectedGoal);
  const setSelectedGoal = useModelManagerStore(
    (state) => state.setSelectedGoal
  );

  const handleToggle = useCallback(
    (goalId: string) => {
      setSelectedGoal(selectedGoal === goalId ? null : goalId);
    },
    [selectedGoal, setSelectedGoal]
  );

  return (
    <FlexRow gap={1} align="center" sx={{ flexWrap: "wrap", mb: 1 }}>
      <Text size="small" color="secondary" sx={{ whiteSpace: "nowrap" }}>
        I want to
      </Text>
      {MODEL_GOALS.map((goalOption) => (
        <Tooltip key={goalOption.id} title={goalOption.description} delay={400}>
          <Chip
            label={goalOption.label}
            size="small"
            active={selectedGoal === goalOption.id}
            color={selectedGoal === goalOption.id ? "primary" : "default"}
            variant={selectedGoal === goalOption.id ? "filled" : "outlined"}
            onClick={() => handleToggle(goalOption.id)}
          />
        </Tooltip>
      ))}
    </FlexRow>
  );
};

export default React.memo(GoalFilterChips);
