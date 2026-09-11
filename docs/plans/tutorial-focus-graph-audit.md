# Graph tutorial focus audit

The graph tutorials use the production `DemoPlayer`. Shot anchors measure the rendered ReactFlow nodes in graph coordinates, including their live heights. The camera passes one controlled viewport back to ReactFlow. It does not scale the graph a second time.

## T1. Build your first workflow

- Cast events: Text Input runs at 300 ms and completes at 1,400 ms; edge `e1` activates at 1,600 ms; Enhance Prompt runs at 2,200 ms, streams from 2,600 ms, and completes at 9,600 ms; Text To Image runs at 10,600 ms and completes with an inline image at 15,500 ms.
- Shots: overview, prompt, input and LLM relationship, stationary LLM stream, image generation, completed image, completed graph.
- Fidelity: the cast has no separate Preview node. The final evidence is the image content in Text To Image, so the captions and final close-up say that directly.

## T2. Connect and run

- Cast events: the source completes at 1,300 ms; `e1` activates at 1,700 ms; Uppercase runs at 2,600 ms and completes at 4,200 ms; `e2` activates at 4,700 ms; Preview receives `HELLO NODETOOL` at 6,000 ms and completes at 6,600 ms.
- Shots: overview, source value, source and Uppercase relationship, Uppercase execution, Uppercase and Preview relationship, completed Preview, completed graph.
- Fidelity: both edges exist in the initial graph and there are no node-add, edge-add, drag, or Run-control events. This edit teaches tracing and running the existing graph. It does not claim or depict graph construction and uses no cursor.

## T3. Generate a list

- Cast events: topic completes at 1,400 ms; `e1` activates at 1,700 ms; Generate List runs at 2,400 ms; five item/index pairs stream from 2,900 ms; the list completes at 10,800 ms; Preview receives the list at 12,500 ms and completes at 13,100 ms.
- Shots: overview, topic, topic and generator relationship, stationary list stream, completed collection in Preview, downstream pair.
- Fidelity: all five authored items fit the list body. No synthetic scroll or pointer action was added.

## T4. Ask the AI

- Cast events: question completes at 1,500 ms; Agent runs at 2,500 ms; answer chunks stream from 3,000 ms; Agent completes at 9,600 ms; Preview receives the answer at 11,300 ms and completes at 11,900 ms.
- Shots: overview, question, question and Agent relationship, stationary answer stream, completed Preview, Agent and Preview context.
- Fidelity: provider controls remain secondary. The cast has no question typing action, so the tutorial describes the existing submitted question.

## T5. Combine two inputs

- Cast events: the name and topic source nodes run and complete separately; both existing edges activate into Prompt; Prompt completes with the substituted sentence; Preview receives the merged value.
- Shots: overview, both source nodes, each source value, both incoming relationships, template, merged Preview, branch-and-merge overview.
- Fidelity: the opening source view is a group. Existing connections are explained without fabricated dragging.

## T6. Summarize a document

- Cast events: the source completes before Summarizer starts; summary chunks stream in the Summarizer body; Preview receives the completed short summary after streaming.
- Shots: overview, long source, source and Summarizer relationship, stationary summary stream, long completed-summary hold, source and summary comparison.
- Fidelity: the source is shown only long enough to establish its size. There is no decorative pan through the passage.

## T7. Describe an image

- Cast events: Image Input completes before Agent starts; description chunks stream in Agent; Preview receives the completed description after streaming.
- Shots: overview, uncropped image node, image and Agent relationship, stationary description stream, completed Preview, image and description comparison.
- Fidelity: the final group view compares the source and description. No pointer action is implied.

## Caption and duration check

Captions were shortened to fit their authored intervals at roughly three words per second plus settling time. Replay windows include a one-second establishing hold and a final result hold. Total composition length is `intro + replay + outro`; the catalog values stay within the plan's initial ranges or use the closest duration needed for readable evidence.
