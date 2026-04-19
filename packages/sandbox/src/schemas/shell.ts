import { z } from "zod";

export const ShellExecInput = z.object({
  id: z.string().min(1),
  exec_dir: z.string().optional(),
  command: z.string().min(1)
});
export type ShellExecInput = z.infer<typeof ShellExecInput>;

export const ShellExecOutput = z.object({
  id: z.string(),
  started: z.boolean()
});
export type ShellExecOutput = z.infer<typeof ShellExecOutput>;

export const ShellViewInput = z.object({
  id: z.string().min(1)
});
export type ShellViewInput = z.infer<typeof ShellViewInput>;

export const ShellViewOutput = z.object({
  id: z.string(),
  output: z.string(),
  running: z.boolean(),
  exit_code: z.number().int().nullable()
});
export type ShellViewOutput = z.infer<typeof ShellViewOutput>;

export const ShellWaitInput = z.object({
  id: z.string().min(1),
  seconds: z.number().positive().optional()
});
export type ShellWaitInput = z.infer<typeof ShellWaitInput>;

export const ShellWaitOutput = z.object({
  id: z.string(),
  output: z.string(),
  running: z.boolean(),
  exit_code: z.number().int().nullable(),
  timed_out: z.boolean()
});
export type ShellWaitOutput = z.infer<typeof ShellWaitOutput>;

export const ShellWriteToProcessInput = z.object({
  id: z.string().min(1),
  input: z.string(),
  press_enter: z.boolean()
});
export type ShellWriteToProcessInput = z.infer<typeof ShellWriteToProcessInput>;

export const ShellWriteToProcessOutput = z.object({
  id: z.string(),
  bytes_written: z.number().int().nonnegative()
});
export type ShellWriteToProcessOutput = z.infer<
  typeof ShellWriteToProcessOutput
>;

export const ShellKillProcessInput = z.object({
  id: z.string().min(1)
});
export type ShellKillProcessInput = z.infer<typeof ShellKillProcessInput>;

export const ShellKillProcessOutput = z.object({
  id: z.string(),
  killed: z.boolean()
});
export type ShellKillProcessOutput = z.infer<typeof ShellKillProcessOutput>;
