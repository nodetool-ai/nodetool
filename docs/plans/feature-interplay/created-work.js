// A curated object view of the research inventory, not a live project graph.
(() => {
  'use strict';
  const source = window.FEATURE_INTERPLAY_DATA;
  const byId = new Map(source.nodes.map(node => [node.id, node]));
  const objects = [
    ['projects', 0, 'Projects'],
    ['skills', 0, 'User skills', 'Saved instructions written by a creator or their agent. Built-in skills are excluded. Instructions can guide creation, but are not executable document dependencies.'],
    ['collections', 0, 'Collections', 'Named collections of indexed text created for retrieval. Collection membership is distinct from project ownership.'],
    ['workflow', 1, 'Workflows'],
    ['js', 1, 'Saved JS scripts'],
    ['apps', 1, 'Mini Apps'],
    ['triggers', 1, 'Triggers'],
    ['entities', 2, 'Entities'],
    ['script', 2, 'Screenplays & takes'],
    ['board', 2, 'Storyboards'],
    ['sketch', 2, 'Sketches'],
    ['timeline', 2, 'Timelines'],
    ['game', 3, 'Games'],
    ['scene', 3, 'Scenes & prefabs'],
    ['behavior', 3, 'Behavior scripts', 'Authored scripts inside a game return state and commands during simulation. These differ from saved JS scripts used by workflows and Mini Apps.'],
    ['assets', 4, 'Assets', 'Saved images, audio, video, models and files, including imported material and generated results. The other file types in this area are kinds of assets, not extra copies. Provenance does not imply a live dependency.'],
    ['model3d', 4, '3D models', 'Editable GLB/glTF assets with scene transforms. Saving preserves asset identity. Rendering uses the saved model.'],
    ['audioedit', 4, 'Audio files', 'Audio assets edited as waveforms and saved as WAV. The saved file does not retain a procedural effect chain.'],
    ['textsvg', 4, 'Text, tables & SVG', 'Editable text, code, table and SVG files stored as assets.']
  ];
  const nodes = objects.map(([id, g, label, description]) => ({
    ...byId.get(id), g, label, ...(description ? { description } : {})
  }));
  nodes.push({
    id: 'chats', g: 0, label: 'Chats', status: 'D', path: 'docs/projects.md',
    description: 'Conversations filed under a project. A chat can load a user skill and ask an agent to build or edit project documents.'
  });
  const additions = [
    ['memory-notes', 0, 'Memory notes', 'D', 'docs/memory.md', 'Durable notes saved by an agent and reviewable by the creator. They can reference resources and the chat in which they were saved. Distinct from per-run agent scratch memory.'],
    ['workspace-files', 4, 'Workspace files', 'D', 'docs/workspaces.md', 'Files created or imported under an authorized workspace root. A workspace file is not automatically an asset-library record.'],
    ['widgets', 1, 'App widgets', 'D', 'docs/mini-apps-reference.md', 'Authored controls, displays and layouts inside a Mini App. Bindings connect widgets to operations, variables or view state.'],
    ['workflow-io', 1, 'Input / Output nodes', 'D', 'docs/mini-apps.md', 'Authored nodes that expose workflow inputs and outputs to callers such as Mini Apps. These existing inputs are distinct from the proposed saved workflow variables.'],
    ['layers', 2, 'Sketch layers', 'D', 'docs/sketch-editor.md', 'Editable image, vector, mask and generated layers contained in a sketch. A generated layer can retain a workflow binding.'],
    ['shots', 2, 'Shots & takes', 'D', 'docs/storyboard-editor.md', 'Shot plans and their candidate takes belong to a storyboard. Rendered media is stored as assets.'],
    ['tracks', 2, 'Timeline tracks', 'S', 'packages/protocol/src/api-schemas/timeline.ts', 'Tracks organize clips inside a timeline document.'],
    ['clips', 2, 'Timeline clips', 'S', 'packages/protocol/src/api-schemas/timeline.ts', 'Placed media or generated content with timing and local settings. A clip can use an asset or retain a source operation.'],
    ['game-candidates', 3, 'Asset candidates', 'D', 'packages/game-nodes/README.md', 'Checked media and staged bindings prepared for game asset slots. They require explicit installation into a game revision.'],
    ['set-variable', 5, 'Set Variable nodes', 'S', 'packages/core-nodes/src/nodes/variable.ts', 'Authored node instances inside a workflow. Set Variable publishes a value by name into the execution context channel and passes the same value through its output. Repeated publications form a stream.'],
    ['get-variable', 5, 'Get Variable nodes', 'S', 'packages/core-nodes/src/nodes/variable.ts', 'Authored node instances that read a named channel. Get Variable replays all buffered publications, then follows new ones until the channel closes. It is not a latest-value lookup.'],
    ['run-variables', 5, 'Run variables', 'S', 'packages/runtime/src/variable-channel.ts', 'Named channels configured by workflow nodes, with values created during execution. They live in a ProcessingContext, not in a persistent project variable store. No registered writer means a closed, empty channel.'],
    ['app-variables', 5, 'App variables', 'S', 'packages/app-runtime/src/document.ts', 'Named values declared in a Mini App. Instance values last for that app instance. User-scoped values may persist when configured to do so. They are distinct from workflow channel histories.'],
    ['workflow-parameters', 5, 'Workflow parameters', 'P', 'docs/plans/shared-variables-input-bindings.md', 'Proposed saved, typed variables owned by a workflow and bound directly to node fields. Existing Input nodes and Set/Get Variable channels remain separate supported paths. This saved-variable proposal is not shipped support.'],
    ['project-variables', 5, 'Project variables', 'P', 'docs/plans/shared-variables-input-bindings.md', 'Proposed shared values with revision-checked writes and explicit workflow mappings. Existing run channels do not establish cross-workflow sharing.']
  ];
  for (const [id, g, label, status, path, description] of additions) {
    nodes.push({ id, g, label, status, path, description });
  }
  const ids = new Set(nodes.map(node => node.id));
  // Use edges point from the consumer to the resource, not along data flow.
  const relationships = {
    e25: ['produces', false, 'Generates a sketch layer'], e26: ['produces', false, 'Generates a timeline clip'],
    e27: ['uses', true, 'Uses cast and references'], e28: ['uses', true, 'Links screenplay lines to shots'],
    e29: ['uses', true, 'Uses screenplay voice takes'], e30: ['uses', true, 'Uses storyboard shots'],
    e31: ['produces', false, 'Exports a flattened image'], e32: ['produces', false, 'Renders a media asset'],
    e33: ['uses', true, 'Uses current media'], e34: ['constraint', false, 'Transfers media, not take identity'],
    e35: ['produces', false, 'Renders an image asset'], e36: ['uses', true, 'Uses rendered model references'],
    e37: ['kind', false, 'Is an audio asset'], e38: ['kind', false, 'Is a file asset'],
    e57: ['contains', false, 'Contains scenes and prefabs'], e60: ['contains', true, 'Contains behavior scripts'],
    e61: ['constraint', false, 'Cannot call an async workflow inside a tick'],
    e79: ['uses', true, 'Uses indexed knowledge'], e81: ['constraint', false, 'Linked workflow does not ingest uploads'],
    e82: ['contains', false, 'Contains assets'], e83: ['contains', false, 'Contains games'],
    e86: ['uses', false, 'Runs a bound workflow'], e87: ['uses', true, 'Runs a saved script'],
    e88: ['uses', false, 'Starts a workflow run']
  };
  const edges = source.edges
    .filter(edge => ids.has(edge.a) && ids.has(edge.b))
    .map(edge => {
      const [kind, reverse, label] = relationships[edge.id];
      const target = edge.id === 'e25' ? 'layers' : edge.id === 'e26' ? 'clips' : edge.b;
      return { ...edge, kind, label, a: reverse ? edge.b : edge.a, b: reverse ? edge.a : target };
    });
  for (const id of ['workflow', 'js', 'apps', 'entities', 'script', 'board', 'sketch', 'timeline']) {
    edges.push({
      id: 'project-' + id, a: 'projects', b: id, label: 'Contains ' + byId.get(id).label.toLowerCase(),
      kind: 'contains', status: 'D', path: 'docs/projects.md',
      detail: 'The document belongs to a project through its project ID. This is organization and ownership, not an execution or update dependency.'
    });
  }
  edges.push({
    id: 'script-workflow', a: 'workflow', b: 'js', kind: 'uses', label: 'Uses a saved script through a Code node',
    status: 'D', path: 'docs/js-scripts.md',
    detail: 'A workflow Code node can use a saved JS script. Version updates are explicit. The Code node is part of the workflow, so it is not a separate object in this layer.'
  });
  edges.push({
    id: 'workflow-assets', a: 'workflow', b: 'assets', kind: 'produces', label: 'Produces saved results',
    status: 'S', path: 'packages/models-core/src/schema/assets.ts',
    detail: 'Saved assets can record their source workflow, node and job. These optional provenance fields do not guarantee complete lineage or automatic regeneration.'
  });
  edges.push({
    id: 'project-chats', a: 'projects', b: 'chats', kind: 'contains', label: 'Contains conversations',
    status: 'D', path: 'docs/projects.md',
    detail: 'Conversations are filed under a project and included in its export. A conversation is not a workflow run.'
  }, {
    id: 'skill-chats', a: 'chats', b: 'skills', kind: 'uses', label: 'Uses task instructions',
    status: 'D', path: 'docs/skills.md',
    detail: 'A chat can load a user skill by name or when its task matches. These instructions guide the agent, without creating a live dependency on documents it edits.'
  }, {
    id: 'workflow-game', a: 'workflow', b: 'game-candidates', kind: 'produces', label: 'Stages generated asset candidates',
    status: 'D', path: 'packages/game-nodes/README.md',
    detail: 'Workflow game nodes prepare checked slot fills for a game. Installation requires a separate authorized game revision operation. Staging does not change behavior scripts.'
  }, {
    id: 'audio-game', a: 'game', b: 'audioedit', kind: 'uses', label: 'Uses sound assets',
    status: 'D', path: 'docs/game-engine/audio.md',
    detail: 'Game sound bindings use stored audio assets. An edited audio file does not connect a live workflow synthesizer to the game.'
  });
  const links = [
    ['workflow', 'workflow-io', 'contains', 'Contains exposed inputs and outputs', 'D', 'docs/mini-apps.md', 'Input and Output nodes declare the workflow interface.'],
    ['apps', 'workflow-io', 'uses', 'Binds workflow inputs and outputs', 'D', 'docs/mini-apps.md', 'App operations connect widgets to the workflow interface. Values without Input or Output nodes are not exposed through this interface.'],
    ['game', 'game-candidates', 'uses', 'Installs checked asset candidates', 'D', 'packages/game-nodes/README.md', 'A separate authorized game revision operation installs the staged bindings. Staging alone does not modify the game.'],
    ['model3d', 'assets', 'kind', 'Is a model asset', 'D', 'docs/3d-editor.md', 'The saved GLB/glTF model is itself an asset. A rendered image is a different result.'],
    ['sketch', 'layers', 'contains', 'Contains layers', 'D', 'docs/sketch-editor.md', 'Layers remain editable inside the sketch. Flattening produces a different representation.'],
    ['board', 'shots', 'contains', 'Contains shots and takes', 'D', 'docs/storyboard-editor.md', 'Shot plans and take selection are part of the storyboard.'],
    ['shots', 'assets', 'uses', 'Uses take media', 'D', 'docs/storyboard-editor.md', 'Shot stills and clips are stored in the asset library.'],
    ['timeline', 'tracks', 'contains', 'Contains tracks', 'S', 'packages/protocol/src/api-schemas/timeline.ts', 'The timeline document stores its tracks.'],
    ['tracks', 'clips', 'contains', 'Contains clips', 'S', 'packages/protocol/src/api-schemas/timeline.ts', 'Clips belong to tracks through trackId. The timeline stores tracks and clips as separate arrays.'],
    ['clips', 'assets', 'uses', 'Uses media assets', 'S', 'packages/protocol/src/api-schemas/timeline.ts', 'Media clips reference source assets. Not every clip is a media clip.'],
    ['apps', 'widgets', 'contains', 'Contains widgets', 'D', 'docs/mini-apps-reference.md', 'Widget definitions and layout belong to the app document.'],
    ['apps', 'app-variables', 'contains', 'Declares variables', 'S', 'packages/app-runtime/src/document.ts', 'Declarations define defaults and scope. Instance and user persistence differ.'],
    ['widgets', 'app-variables', 'reads', 'Displays variable values', 'D', 'docs/mini-apps-reference.md', 'Display widgets can bind to var:<variableId>.'],
    ['widgets', 'app-variables', 'writes', 'Edits variable values', 'D', 'docs/mini-apps-reference.md', 'Input widgets can bind to app variables. A variable edit alone is not a workflow execution.'],
    ['workflow', 'set-variable', 'contains', 'Contains writer nodes', 'S', 'packages/core-nodes/src/nodes/variable.ts', 'Set Variable is an authored node instance inside the graph.'],
    ['workflow', 'get-variable', 'contains', 'Contains reader nodes', 'S', 'packages/core-nodes/src/nodes/variable.ts', 'Get Variable is an authored node instance inside the graph.'],
    ['set-variable', 'run-variables', 'writes', 'Publishes named values', 'S', 'packages/core-nodes/src/nodes/variable.ts', 'Calls context.getChannel(name).send(value). Publications append to a channel history and pass through the node output.'],
    ['get-variable', 'run-variables', 'reads', 'Replays and follows values', 'S', 'packages/runtime/src/variable-channel.ts', 'Each reader starts at the beginning of the channel history, then waits for new values. The runner closes the channel when its last writer finishes.'],
    ['apps', 'run-variables', 'uses', 'Maps workflow channel names', 'S', 'packages/app-runtime/src/operations.ts', 'mergeVariables exposes workflow channel names as nonpersistent instance variables unless already declared. This is an adapter, not shared persistent storage.'],
    ['workflow', 'workspace-files', 'reads', 'Reads workspace files', 'D', 'docs/javascript-sandbox.md', 'Authorized code in the run can read files through workspace capabilities.'],
    ['workflow', 'workspace-files', 'writes', 'Writes workspace files', 'D', 'docs/javascript-sandbox.md', 'Authorized code in the run can write workspace files. Saving a file does not automatically register an asset.'],
    ['memory-notes', 'assets', 'uses', 'References saved assets', 'D', 'docs/memory.md', 'Memory notes can carry typed asset references. This does not create a live update dependency.'],
    ['memory-notes', 'chats', 'uses', 'Records its source chat', 'D', 'docs/memory.md', 'A note may record the conversation where it was saved. Notes saved outside chat need not have a thread.'],
    ['workflow', 'workflow-parameters', 'contains', 'Declares saved parameters', 'P', 'docs/plans/shared-variables-input-bindings.md', 'Proposed document-owned values and direct field bindings. Existing Set/Get Variable nodes keep their run channel behavior.'],
    ['projects', 'project-variables', 'contains', 'Owns shared variables', 'P', 'docs/plans/shared-variables-input-bindings.md', 'Proposed persistent project values with checked revisions.'],
    ['workflow-parameters', 'project-variables', 'reads', 'Maps a shared input', 'P', 'docs/plans/shared-variables-input-bindings.md', 'Proposed explicit mappings supply project values as workflow inputs. No automatic rerun is implied.']
  ];
  for (const [a, b, kind, label, status, path, detail] of links) {
    edges.push({ id: `${a}-${kind}-${b}`, a, b, kind, label, status, path, detail });
  }
  window.CREATED_WORK_DATA = {
    relations: { contains: 'Contains', uses: 'Uses / references', produces: 'Produces', reads: 'Reads', writes: 'Writes', kind: 'Is a kind of', constraint: 'Limited / unsupported' },
    groups: ['Organization & knowledge', 'Reusable tools', 'Creative documents', 'Game documents', 'Saved files', 'Variables & state'],
    origins: [[0, 0], [500, 0], [500, 450], [0, 450], [1000, 450], [1000, 0]],
    states: source.states, nodes, edges
  };
})();
