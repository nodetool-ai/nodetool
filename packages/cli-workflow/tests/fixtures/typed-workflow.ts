import { workflow, t, template } from "@nodetool-ai/dsl";
export const greeting = workflow(
  { name: t.string().optional("Ada") },
  ({ name }) => ({ greeting: template`Hello ${name}!` })
);
