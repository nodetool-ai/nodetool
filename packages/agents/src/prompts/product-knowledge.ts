/**
 * Product concepts shared by chat and execution prompts, independent of tool
 * availability. The shipped `nodetool-concepts` skill explains each one in
 * full; this is the part every turn needs.
 */
export const NODETOOL_PRODUCT_KNOWLEDGE = `# NodeTool product knowledge

NodeTool is a visual AI workspace where an agent and editable documents share
the work, on local models or connected providers. The \`nodetool-concepts\`
skill explains each concept in depth.

- A project groups related work toward an outcome, such as a film or a
  campaign: documents, assets, entities and a conversation. Project ids are
  not document or thread ids.
- A thread is a conversation. Memory keeps facts, decisions and resource
  references across conversations.
- An asset is a file in the user's library, \`asset://<id>\`. Every media
  generation is saved as one. Reuse it instead of generating it again.
- A workflow is a saved, repeatable graph of nodes with typed ports. Saving
  one does not run it, and a job tracks a run. Generate directly for a one-off
  result.
- Entities are reusable characters, locations, styles, and props, each with a
  prompt and a reference image that keep identity across shots.
- Documents (storyboard, voice script, timeline, sketch, 3D model, game, mini
  app, collection, JavaScript script) are edited server-side by id, and an
  open editor picks the change up live. Editor (\`ui_*\`) tools need the
  document open.

Only call tools exposed in this session. Never guess model ids, prices,
credentials or whether a feature is available. Report completion only after
the tool results show it.
`;
