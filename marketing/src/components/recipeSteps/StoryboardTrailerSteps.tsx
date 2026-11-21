import type { ReactNode } from "react";
import {
  AssignmentGrid,
  Checklist,
  Field,
  Note,
  Panel,
  Quote,
  Shots,
  StepDiagram,
  Still,
  Tags,
  Timeline
} from "./StepDiagram";

/*
 * Run 2026-09-10-marketing-recipes-01, storyboard-to-trailer. Shots, style,
 * and the score prompt come from documents/screenplay-reviewed.json, shot
 * assignments from documents/entities.json, and voice lines from
 * documents/voiceover.txt. The run stops at the board, so motion, score, and
 * the cut are shown as planned.
 */

const SHOTS = [
  { label: "Lighthouse at blue hour", seconds: 6, text: "Wide view from the stone path, one warm window." },
  { label: "The bottle on the headland", seconds: 6, text: "Elin reaches toward the bottle once." },
  { label: "Bottle and note in the room", seconds: 7, text: "Slow push toward the unfolded paper." },
  { label: "Elin looks up", seconds: 6, text: "She lifts her eyes once toward the window." },
  { label: "The beam at night", seconds: 7, text: "One slow sweep across the water." },
  { label: "Recognition", seconds: 6, text: "Frontal close-up as she reads." }
];

const ENTITIES = [
  { name: "Elin", src: "trailer/elin.webp", shots: [2, 4, 6] },
  { name: "North Point Lighthouse", src: "trailer/lighthouse.webp", shots: [1, 2, 5] },
  { name: "Keeper's Room", src: "trailer/keepers-room.webp", shots: [3, 4, 6] },
  { name: "Message Bottle", src: "trailer/message-bottle.webp", shots: [2, 3] }
];

const LINES = [
  { start: 7, end: 10, shot: 2, text: "The tide brought it in." },
  { start: 14, end: 18, shot: 3, text: "The date is forty years from now." },
  { start: 33, end: 37, shot: 6, text: "And the handwriting is mine." }
];

function still(index: number, label?: string) {
  return (
    <Still
      src={`trailer/shot-${index}.webp`}
      alt={`Storyboard still for shot ${index}: ${SHOTS[index - 1].label}.`}
      width={320}
      height={178}
      label={label}
    />
  );
}

const premise = (
  <Quote>
    A lighthouse keeper discovers a bottle carrying a message dated forty years
    in the future, written in her own hand.
  </Quote>
);

let cursor = 0;
const picture = SHOTS.map((shot, index) => {
  const clip = {
    start: cursor,
    end: cursor + shot.seconds,
    src: `trailer/shot-${index + 1}.webp`,
    label: `SH ${index + 1}`
  };
  cursor += shot.seconds;
  return clip;
});

export const storyboardTrailerSteps: Record<string, ReactNode> = {
  idea: (
    <StepDiagram
      give={premise}
      does={{
        where: "Storyboard · Idea",
        title: "Start from a written premise",
        notes: ["Name the character, the discovery, and the mood"]
      }}
      get={
        <Panel title="The Next Tide">
          <Field label="Character">One keeper, Elin</Field>
          <Field label="Places and props">A lighthouse, a room, a message bottle</Field>
          <Field label="Mood">Restrained mystery, blue-hour coast, warm amber room</Field>
        </Panel>
      }
    />
  ),
  story: (
    <StepDiagram
      give={<Tags items={["Mystery", "6 shots"]} />}
      does={{
        where: "Storyboard · Story",
        title: "Generate the screenplay",
        notes: ["Scenes, framing, and one action per shot"]
      }}
      get={<Shots items={SHOTS.map(({ label, seconds }) => ({ label, seconds }))} />}
    />
  ),
  review: (
    <StepDiagram
      give={<Shots items={SHOTS.slice(0, 3).map(({ label, seconds }) => ({ label, seconds }))} />}
      giveLabel="Draft shots"
      does={{
        where: "Storyboard · Story",
        title: "Shape the reveal",
        notes: ["Read the six shots in order", "One clear action each"]
      }}
      get={<Shots items={SHOTS} />}
    />
  ),
  entities: (
    <StepDiagram
      wideResult
      give={
        <div className="grid grid-cols-2 gap-2">
          {ENTITIES.map((entity) => (
            <Still
              key={entity.name}
              src={entity.src}
              alt={`Reference image for ${entity.name}.`}
              width={320}
              height={180}
              label={entity.name}
            />
          ))}
        </div>
      }
      does={{
        where: "Storyboard · Entities",
        title: "Cast references shot by shot",
        notes: ["Each reference goes only where it appears"]
      }}
      get={<AssignmentGrid shots={SHOTS.map((_, index) => `S${index + 1}`)} entities={ENTITIES} />}
    />
  ),
  look: (
    <StepDiagram
      give={<Tags items={["16:9", "Cinematic"]} />}
      does={{
        where: "Storyboard · Look",
        title: "Set the light before rendering",
        notes: ["Pick a model that uses entity references"]
      }}
      get={
        <Panel title="Style bible">
          <p>
            Cold blue-gray sea and sky, weathered stone, warm amber practical
            light only in the keeper&apos;s room. Slow deliberate camera
            movement. No generated lettering.
          </p>
        </Panel>
      }
    />
  ),
  stills: (
    <StepDiagram
      wideResult
      give={<Tags items={["Six shots", "Four references", "Look"]} />}
      does={{
        where: "Storyboard · Render stills",
        title: "Render one still per shot",
        notes: ["Check Elin, the lighthouse, the room, and the bottle", "Revise a shot or ask the Storyboard Assistant"]
      }}
      get={
        <div className="grid grid-cols-3 gap-2">
          {SHOTS.map((shot, index) => (
            <div key={shot.label}>{still(index + 1)}</div>
          ))}
        </div>
      }
    />
  ),
  script: (
    <StepDiagram
      give={
        <div className="grid grid-cols-3 gap-2">
          {still(2, "Shot 2")}
          {still(3, "Shot 3")}
          {still(6, "Shot 6")}
        </div>
      }
      does={{
        where: "Script · Voices",
        title: "Write and voice the narrator",
        notes: ["Open the linked script or use Extract script", "Match each take to its shot"]
      }}
      get={
        <Shots
          items={LINES.map((line) => ({
            label: `Elin · shot ${line.shot}`,
            text: line.text
          }))}
        />
      }
    />
  ),
  motion: (
    <StepDiagram
      give={<div className="max-w-[12rem]">{still(5, "SH 5 still")}</div>}
      does={{
        where: "Storyboard · Clips",
        title: "Give each shot one restrained move",
        notes: ["Check identity and continuity before assembling"]
      }}
      get={
        <Panel title="Motion direction for shot 5">
          <p>
            Locked camera. One slow lighthouse-beam sweep across the water, low
            natural wave movement.
          </p>
          <Checklist pending items={["Clips are not rendered in this example"]} />
        </Panel>
      }
    />
  ),
  timeline: (
    <StepDiagram
      wideResult
      give={<Tags items={["Six clips", "Three voice lines", "Score"]} />}
      does={{
        where: "Timeline",
        title: "Assemble and mix the trailer",
        notes: ["Editable title text", "Play the full cut before export"]
      }}
      get={
        <Timeline
          duration={40}
          tracks={[
            { label: "Picture", clips: picture },
            {
              label: "Voice",
              clips: LINES.map((line) => ({
                start: line.start,
                end: line.end,
                tone: "voice" as const,
                label: line.text
              }))
            },
            {
              label: "Score",
              clips: [{ start: 0, end: 40, tone: "planned" as const, label: "Sparse low piano, slow pulse, quiet tail" }]
            }
          ]}
          caption="The plan from the screenplay: 38 seconds of shots and a two-second title. Clips, score, and the cut are not made in this example."
        />
      }
    />
  )
};
