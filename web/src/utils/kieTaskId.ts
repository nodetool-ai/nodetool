/** KIE task history / logs page (no per-task deep link in their UI). */
export const KIE_LOGS_URL = "https://kie.ai/logs";

const KIE_TASK_ID_PATTERN = /\(taskId:\s*([^)\s]+)\)/i;

/** Extract a KIE task id from an error message, if present. */
export function extractKieTaskId(text: string): string | undefined {
  const match = text.match(KIE_TASK_ID_PATTERN);
  const taskId = match?.[1]?.trim();
  return taskId || undefined;
}
