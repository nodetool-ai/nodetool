/**
 * Image build specification for NodeTool Docker images.
 *
 * This module provides a Zod schema and loader for `nodetool-image.yaml` files
 * that declaratively describe what goes into a Docker image.
 */

import { z } from "zod";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";

// ============================================================================
// Schemas
// ============================================================================

const PythonConfigSchema = z.object({
  version: z
    .string()
    .regex(/^\d+\.\d+$/, "Python version must be 'X.Y' format (e.g. '3.11')"),
  packages: z.array(z.string()).default([]),
  index_url: z.string().default("https://pypi.org/simple"),
  extra_index_urls: z.array(z.string()).default([])
});

export const ImageBuildSpecSchema = z.object({
  mode: z.enum(["fullstack", "backend"]).default("fullstack"),
  apt_packages: z.array(z.string()).default([]),
  python: PythonConfigSchema.optional(),
  cuda: z
    .string()
    .regex(/^\d+\.\d+(\.\d+)?$/, "CUDA version must be 'X.Y' or 'X.Y.Z' format")
    .optional()
});

// ============================================================================
// Types
// ============================================================================

export type ImageBuildSpec = z.infer<typeof ImageBuildSpecSchema>;
export type PythonConfig = z.infer<typeof PythonConfigSchema>;

// ============================================================================
// Parsing and Loading
// ============================================================================

/** Parse and validate raw data into an ImageBuildSpec. */
export function parseImageSpec(data: unknown): ImageBuildSpec {
  return ImageBuildSpecSchema.parse(data);
}

/**
 * Load an image build spec from a YAML file.
 *
 * Reads the file at `specPath`, parses it as YAML, and validates it against
 * the ImageBuildSpec schema. An empty or null YAML document produces a valid
 * spec with all defaults applied.
 */
export async function loadImageSpec(specPath: string): Promise<ImageBuildSpec> {
  const raw = await fs.readFile(specPath, "utf-8");
  const data = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
  return parseImageSpec(data ?? {});
}
