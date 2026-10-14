/**
 * What a shipped example needs before it runs: the kinds of model it asks the
 * user to pick, and the credentials its nodes declare. Derived from the
 * example's own document (a workflow graph, an app bundle), never from its
 * description, so a gallery card can say "Runs as is" only when nothing in the
 * document asks for a model or a key.
 */

import { z } from "zod";

export const exampleNeeds = z.object({
  /** Model reference types found in the document, e.g. `image_model`. */
  modelKinds: z.array(z.string()),
  /** Settings (API keys) that the document's nodes declare as required. */
  requiredSettings: z.array(z.string())
});
export type ExampleNeeds = z.infer<typeof exampleNeeds>;

const MODEL_TYPE = /^[a-z0-9]+(?:_[a-z0-9]+)*_model$/;

const typedObject = z.object({ type: z.string() });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Walk any JSON value and collect what it needs. A model reference is an
 * object whose `type` ends in `_model` and that carries a `provider` or `id`
 * field, selected or not: an unselected field still asks the user for a model.
 * A node is any object whose `type` the lookup knows; its required settings
 * are the keys it needs.
 */
export function scanExampleNeeds(
  value: unknown,
  requiredSettingsOf: (nodeType: string) => readonly string[] | undefined = () =>
    undefined
): ExampleNeeds {
  const modelKinds = new Set<string>();
  const requiredSettings = new Set<string>();
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }
    if (!isObject(current)) {
      continue;
    }
    const typed = typedObject.safeParse(current);
    if (typed.success) {
      const { type } = typed.data;
      if (MODEL_TYPE.test(type) && ("provider" in current || "id" in current)) {
        modelKinds.add(type);
      } else if (type.includes(".")) {
        for (const setting of requiredSettingsOf(type) ?? []) {
          requiredSettings.add(setting);
        }
      }
    }
    // Scalars are skipped when popped, so every value can be pushed.
    stack.push(...Object.values(current));
  }
  return {
    modelKinds: [...modelKinds].sort(),
    requiredSettings: [...requiredSettings].sort()
  };
}

/** True when the example asks for no model and no key. */
export function exampleRunsAsIs(needs: ExampleNeeds): boolean {
  return needs.modelKinds.length === 0 && needs.requiredSettings.length === 0;
}
