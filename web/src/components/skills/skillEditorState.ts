export const preserveEditAfterSubmit = <T>(
  current: T,
  submitted: T,
  saved: T
): T => (current === submitted ? saved : current);

export const shouldApplyServerSkill = ({
  initializedSkillId,
  incomingSkillId,
  hasLocalChanges,
  incomingUpdatedAt,
  baseUpdatedAt
}: {
  initializedSkillId: string | null;
  incomingSkillId: string;
  hasLocalChanges: boolean;
  incomingUpdatedAt: string;
  baseUpdatedAt: string | null;
}): boolean =>
  initializedSkillId !== incomingSkillId ||
  (!hasLocalChanges && incomingUpdatedAt !== baseUpdatedAt);
