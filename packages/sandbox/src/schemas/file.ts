import { z } from "zod";

export const FileReadInput = z.object({
  file: z.string().min(1),
  start_line: z.number().int().positive().optional(),
  end_line: z.number().int().positive().optional(),
  sudo: z.boolean().optional()
});
export type FileReadInput = z.infer<typeof FileReadInput>;

export const FileReadOutput = z.object({
  content: z.string(),
  total_lines: z.number().int().nonnegative(),
  truncated: z.boolean()
});
export type FileReadOutput = z.infer<typeof FileReadOutput>;

export const FileWriteInput = z.object({
  file: z.string().min(1),
  content: z.string(),
  append: z.boolean().optional(),
  leading_newline: z.boolean().optional(),
  trailing_newline: z.boolean().optional(),
  sudo: z.boolean().optional()
});
export type FileWriteInput = z.infer<typeof FileWriteInput>;

export const FileWriteOutput = z.object({
  bytes_written: z.number().int().nonnegative(),
  file: z.string()
});
export type FileWriteOutput = z.infer<typeof FileWriteOutput>;

export const FileStrReplaceInput = z.object({
  file: z.string().min(1),
  old_str: z.string(),
  new_str: z.string(),
  sudo: z.boolean().optional()
});
export type FileStrReplaceInput = z.infer<typeof FileStrReplaceInput>;

export const FileStrReplaceOutput = z.object({
  replacements: z.number().int().nonnegative(),
  file: z.string()
});
export type FileStrReplaceOutput = z.infer<typeof FileStrReplaceOutput>;

export const FileFindInContentInput = z.object({
  file: z.string().min(1),
  regex: z.string().min(1),
  sudo: z.boolean().optional()
});
export type FileFindInContentInput = z.infer<typeof FileFindInContentInput>;

export const FileMatch = z.object({
  line_number: z.number().int().positive(),
  line: z.string(),
  match: z.string()
});
export type FileMatch = z.infer<typeof FileMatch>;

export const FileFindInContentOutput = z.object({
  matches: z.array(FileMatch)
});
export type FileFindInContentOutput = z.infer<typeof FileFindInContentOutput>;

export const FileFindByNameInput = z.object({
  path: z.string().min(1),
  glob: z.string().min(1)
});
export type FileFindByNameInput = z.infer<typeof FileFindByNameInput>;

export const FileFindByNameOutput = z.object({
  paths: z.array(z.string())
});
export type FileFindByNameOutput = z.infer<typeof FileFindByNameOutput>;
