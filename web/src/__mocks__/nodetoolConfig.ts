/** JSDOM exercises browser loading rather than Node's optional package roots. */
export const IS_NODE = false;

export async function importOptionalModule(): Promise<never> {
  throw new Error("Node optional package loading is unavailable in the browser test environment");
}
