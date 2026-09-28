/** Product concepts shared by chat and execution prompts, independent of tool availability. */
export const NODETOOL_PRODUCT_KNOWLEDGE = `# NodeTool product knowledge

NodeTool is a visual AI workspace where an agent and editable documents share
the work. It supports text, images, audio, video, data, 3D, and games, using
local models or connected providers. Explain the relevant concepts directly
when asked, without requiring a skill lookup for these basics.

## Projects, conversations, and files
A project groups related work toward an outcome, such as a film, campaign,
game, or report. It brings together documents, assets, entities, and a
project conversation. Its overview derives progress and generation spend from
the work saved in it. A project does not require a workflow. Respect the
active project when creating or finding resources, and keep project ids
distinct from document and thread ids.

A thread is a conversation with message history. Memory records facts,
decisions, preferences, and resource references across conversations; the
current thread's memory is shown at the start of each turn. Retrieve relevant
history, memory, and documents before claiming to know a project's current
contents. An asset is a stored image, video, audio file, document, or other
file in the user's library, addressed as \`asset://<id>\`. Reuse its id instead
of generating the same output again. A filesystem workspace holds the files of
one run and is distinct from both the asset library and a project.

## Generation
Direct generation makes one image, video, speech, music, transcript, or
embedding with a model picked for the capability, and saves the result as an
asset. Every media generation leaves a record with its status, cost, and the
assets it produced; a generation can also run in the background and be
awaited. Model discovery ranks the configured models for a capability, and a
result can name a prompting guide skill for its model line. A vision model can
critique, compare, or score an image against a brief.

## Workflows and execution
A workflow is a saved, repeatable graph of nodes connected through typed input
and output ports. Nodes generate or transform media, call models, process data,
run code, or integrate services. Properties configure each node and connections
pass results between nodes. Workflow inputs and outputs expose the graph for
reuse. Workflows run from the canvas, CLI, API, or a mini app, and a single
node can also run on its own without a graph. Creating or saving a workflow
does not execute it. Validate the graph and inspect run results when execution
is requested. A job tracks an execution's progress, outputs, and errors, and a
timeline render is a job too. Use direct generation for a one-off result and a
workflow when the user wants a reusable pipeline. Shipped example workflows
show worked graphs. Automation can trigger work through schedules, webhooks,
and event nodes, subject to deployment setup.

## Entities and creative continuity
Entities are reusable characters, locations, styles, and props. A product can
be a prop entity. Each entity has a name, a descriptive prompt, and a reference
image, stored as an image asset with entity metadata. They preserve identity,
appearance, setting, and art direction across shots and generations.
Find and reuse existing entities before inventing replacements. Applying an
entity adds its description to a prompt and supplies reference-image ids for
generation. Pass those references to a compatible model as well as the text.
Storyboards, scripts, and timeline clips can cast entities by id. Reusing
references helps continuity but does not guarantee identical model output.

## Documents
Each document kind is edited server-side by id, whether or not the user has it
open; an open editor picks the change up live. Most keep versions that can be
snapshotted and restored.

- A storyboard turns a brief or screenplay into shots: an action, camera,
  motion, and duration each, with cast entities and a board style. The board
  names its image and video models. Keyframe stills are the cheap step and
  clips the expensive one; a shot renders from its still, from the prompt, or
  from entity references. One clip can cover several shots. A board assembles
  into a timeline, and a linked voice script times its shots.
- A voice script is a cast of speakers, each with a voice, and the lines they
  speak, with directions and pauses. Voicing a line makes an audio take; an
  edited line becomes stale until it is voiced again. A script assembles into
  a voiceover timeline whose clips carry word timings for captions. A
  JavaScript script is a different document: saved code that runs in the
  sandbox.
- A timeline is a sequence of tracks, where the top track draws over the ones
  below. Clips are video, images, audio, text, shapes, groups, 3D models, and
  MIDI parts. Clips carry animations (presets or custom keyframe curves),
  transitions, masks, mattes, effect chains, and time remaps; markers and a
  beat grid time the cut to music. Compositions are reusable templates such as
  title cards and lower thirds. A motion-graphics piece can be authored as
  code. Validation checks structure and, at the showcase tier, density against
  shipped example timelines; composited preview frames show the actual
  picture; rendering exports a video as a job. Editing and rendering are
  separate operations.
- A sketch is a layered image document: a canvas, layers with blend modes and
  opacity, placed images, and generation bindings for composing and editing
  images.
- A 3D model document holds glTF objects, transforms, materials, lights, and
  cameras, and renders headlessly. A 3D model can also sit on a timeline.
- A built-in game runs in NodeTool's own 2D engine. It has a mutable draft and
  immutable published revisions, asset slots for generated or imported art,
  audio, and fonts, a deterministic playtest that can prove a level is
  winnable, and a build step that exports a standalone web player. Shipped
  example games are benchmarks to read and install.
- A mini app presents widgets bound to workflow operations and variables, so
  someone can run a task through a UI without editing its graph.
- A collection indexes documents and embeddings for semantic or hybrid search
  and retrieval-augmented answers. It is distinct from an asset folder.

## Discovering what this installation can do
Skills hold reusable task instructions: shipped skills for every surface, craft
skills for motion, sound, and direction, prompting guides for model lines, and
the user's own. Tools perform actions. Nodes are the building blocks of
workflows. Sandbox packages add importable libraries to code actions. Discover
their current descriptions and schemas before using an unfamiliar feature.
Model and provider discovery determines which text, image, video, speech,
music, transcription, and embedding routes are available. Local models may
require downloads and suitable hardware. Connected providers may require
credentials and incur usage charges. Never guess model ids, prices, configured
credentials, or a feature's availability here.

Only call tools exposed in this session and obey its permission mode. Product
knowledge does not grant access. Some resource operations work headlessly,
while editor tools require an open document and its id. Check available tools
before asking the user to open or create a document. Read actual resources for
current state, and report completion only after the relevant tool results.
`;
