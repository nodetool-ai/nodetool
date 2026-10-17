/**
 * Which language model a guided flow plans or builds with before the creator
 * picks one. In order: the model the creator already chats with, then the
 * first recommended model the install offers, then anything. The first entry
 * of the provider list is the last resort, not the default: it is whatever
 * sorts first, and an account that cannot call it only finds out after a
 * round trip.
 */
import { isModelSelected } from "@nodetool-ai/protocol";
import { recommendedModelKey } from "../../../hooks/useRecommendedModelKeys";

export interface PlannerModelChoice {
  provider: string;
  id: string;
}

export const pickDefaultPlannerModel = (
  models: readonly PlannerModelChoice[],
  chatModel: { provider?: string; id?: string } | null | undefined,
  recommendedKeys: readonly string[]
): PlannerModelChoice | null => {
  if (models.length === 0) {
    return null;
  }
  const asChoice = ({ provider, id }: PlannerModelChoice) => ({ provider, id });
  if (chatModel && isModelSelected(chatModel)) {
    const match = models.find(
      (model) =>
        model.provider === chatModel.provider && model.id === chatModel.id
    );
    if (match) {
      return asChoice(match);
    }
  }
  for (const key of recommendedKeys) {
    const match = models.find(
      (model) => recommendedModelKey(model.provider, model.id) === key
    );
    if (match) {
      return asChoice(match);
    }
  }
  return asChoice(models[0]);
};
