/**
 * Shape of a plan the chat can render: create_plan's result, or the
 * ProposedPlan on a plan-approval request. Extra fields (counts, executed)
 * are optional so both sources parse.
 */

import {
  isArray,
  isFiniteNumber,
  isRecord,
  isString
} from "../../../utils/typePredicates";

export interface PlanDocumentStep {
  id: string;
  instructions: string;
}

export interface PlanDocumentTask {
  id: string;
  title: string;
  dependsOn: string[];
  steps: PlanDocumentStep[];
}

export interface PlanDocumentModel {
  title: string;
  tasks: PlanDocumentTask[];
  /** False when create_plan returned the plan without running it. */
  executed: boolean | null;
  /** Tasks with no dependencies — they can run together. */
  parallelizable: number;
}

const nonEmpty = (value: unknown): string | null =>
  isString(value) && value.trim().length > 0 ? value.trim() : null;

const parseStep = (
  value: unknown,
  index: number
): PlanDocumentStep | null => {
  if (!isRecord(value)) {
    return null;
  }
  const instructions = nonEmpty(value["instructions"]);
  if (!instructions) {
    return null;
  }
  return {
    id: nonEmpty(value["id"]) ?? `step-${index + 1}`,
    instructions
  };
};

const parseTask = (
  value: unknown,
  index: number
): PlanDocumentTask | null => {
  if (!isRecord(value)) {
    return null;
  }
  const title = nonEmpty(value["title"]);
  if (!title) {
    return null;
  }
  const dependsRaw = value["depends_on"] ?? value["dependsOn"];
  const dependsOn = isArray(dependsRaw)
    ? dependsRaw.filter(isString).map((id) => id.trim()).filter(Boolean)
    : [];
  const stepsRaw = value["steps"];
  const steps = isArray(stepsRaw)
    ? stepsRaw
        .map((step, i) => parseStep(step, i))
        .filter((step): step is PlanDocumentStep => step !== null)
    : [];
  return {
    id: nonEmpty(value["id"]) ?? `task-${index + 1}`,
    title,
    dependsOn,
    steps
  };
};

const coerceRecord = (value: unknown): Record<string, unknown> | null => {
  if (isRecord(value)) {
    return value;
  }
  if (!isString(value)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** Parse a create_plan result or ProposedPlan. Null when it is not a plan. */
export const parsePlanDocument = (
  value: unknown
): PlanDocumentModel | null => {
  const record = coerceRecord(value);
  if (!record) {
    return null;
  }
  const title = nonEmpty(record["title"]);
  const tasksRaw = record["tasks"];
  if (!title || !isArray(tasksRaw) || tasksRaw.length === 0) {
    return null;
  }
  const tasks = tasksRaw
    .map((task, i) => parseTask(task, i))
    .filter((task): task is PlanDocumentTask => task !== null);
  if (tasks.length === 0) {
    return null;
  }
  const executed =
    record["executed"] === false
      ? false
      : record["executed"] === true
        ? true
        : null;
  const parallelizable = isFiniteNumber(record["parallelizable"])
    ? record["parallelizable"]
    : tasks.filter((task) => task.dependsOn.length === 0).length;
  return { title, tasks, executed, parallelizable };
};
