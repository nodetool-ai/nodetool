import type { ReactNode } from "react";
import {
  Checklist,
  Note,
  Panel,
  Quote,
  Row,
  StepDiagram,
  Still,
  Timeline
} from "./StepDiagram";

/*
 * Run 2026-09-14-impossible-product-worlds-dreamina. Frames come from the
 * finished Dreamina MP4. Time ranges and wording come from the run's
 * prompt.txt. The take was generated in Dreamina, so the operation boxes name
 * Dreamina.
 */

function frame(name: string, alt: string, label?: string) {
  return (
    <Still
      src={`worlds/${name}.webp`}
      alt={alt}
      width={240}
      height={426}
      size="xs"
      label={label}
    />
  );
}

const productImage = (
  <Still
    src="worlds/product.webp"
    alt="Olive travel cup with a charcoal lid on a plain background."
    width={240}
    height={180}
    size="md"
    label="@Image1, the product reference"
  />
);

const beats = [
  { start: 0, end: 6, src: "worlds/reveal.webp", label: "00–06 Approach, reveal, run" },
  { start: 6, end: 9, src: "worlds/jump.webp", label: "06–09 Jump" },
  { start: 9, end: 15.072, src: "worlds/drink.webp", label: "09–15 Drink" }
];

export const impossibleProductWorldsSteps: Record<string, ReactNode> = {
  reference: (
    <StepDiagram
      doesLabel="What happens"
      give={productImage}
      does={{
        where: "Prepare · Product",
        title: "List the details that must survive",
        notes: ["Write them down before adding the impossible setting"]
      }}
      get={
        <Panel title="Identity lock in the brief">
          <Checklist
            items={[
              "Muted-olive tapered matte body",
              "Charcoal fitted flat lid with a raised rim",
              "Rectangular drinking opening",
              "No handle, logo, or lettering"
            ]}
          />
        </Panel>
      }
    />
  ),
  brief: (
    <StepDiagram
      doesLabel="What happens"
      give={
        <Quote>
          Race low over golden dunes toward the cup at monumental scale. Climb
          its body, crest the lid rim, and tilt down to reveal a turquoise
          pool…
        </Quote>
      }
      does={{
        where: "Dreamina · Prompt",
        title: "Describe one world at two scales",
        notes: [
          "Desert approach, pool in the lid, jump, closing drink",
          "Name the light, water, and fabric once for both scales"
        ]
      }}
      get={
        <Row>
          {frame("dunes", "The giant cup stands among desert dunes.", "Monumental")}
          {frame("reveal", "A turquoise pool recessed inside the lid.", "Pool in the lid")}
          {frame("drink", "The woman drinks from the cup on a terrace.", "Human scale")}
        </Row>
      }
    />
  ),
  timing: (
    <StepDiagram
      doesLabel="What happens"
      wideResult
      give={
        <Panel title="Beats">
          <Checklist
            items={["Approach", "Reveal", "Jump", "Splash cut", "Drink"]}
          />
        </Panel>
      }
      does={{
        where: "Dreamina · Prompt",
        title: "Add timecodes to the brief",
        notes: ["One action per time range"]
      }}
      get={
        <Timeline
          duration={15.072}
          tracks={[{ label: "Prompt", clips: beats }]}
          caption="The three time ranges written in the brief, drawn to the length of the finished take."
        />
      }
    />
  ),
  identity: (
    <StepDiagram
      doesLabel="What happens"
      give={productImage}
      does={{
        where: "Dreamina · Reference",
        title: "Attach the photo for identity only",
        notes: [
          "The prompt says what must not change",
          "The prompt, not the photo, carries the setting and the woman"
        ]
      }}
      get={
        <>
          <Row>
            {frame("drink", "The returned cup at human scale.", "Returned cup")}
            {frame("final", "Close view of the drink.", "Closing view")}
          </Row>
          <Note>
            Compare the returned cup with the reference. In this take the lid
            and body proportions differ in some frames.
          </Note>
        </>
      }
    />
  ),
  generate: (
    <StepDiagram
      doesLabel="What happens"
      give={
        <Panel title="Camera direction">
          <Checklist
            items={[
              "Low chase over the dunes",
              "Climb the cup and crest the rim",
              "Track beside her, orbit the jump",
              "Match cut through the splash"
            ]}
          />
        </Panel>
      }
      does={{
        where: "Dreamina · Generate",
        title: "Render the full 15-second take",
        notes: ["Each move has a subject and a destination"]
      }}
      get={
        <Row>
          {frame("climb", "The camera rises along the cup's body.", "Climb")}
          {frame("run", "She runs along the pool deck.", "Run")}
          {frame("jump", "She leaps above the pool.", "Orbit")}
          {frame("splash", "Underwater, through the splash.", "Splash cut")}
        </Row>
      }
    />
  ),
  review: (
    <StepDiagram
      doesLabel="What happens"
      give={
        <Row>
          {frame("reveal", "The pool revealed in the lid.", "00–06")}
          {frame("jump", "The jump.", "06–09")}
          {frame("drink", "The drink.", "09–15")}
        </Row>
      }
      does={{
        where: "Review",
        title: "Check the beats in order",
        notes: ["If one beat fails, revise only its time range"]
      }}
      get={
        <Panel title="Found in this take">
          <Checklist
            items={[
              "The cup stays monumental until the splash",
              "Scale returns to human size for the drink"
            ]}
          />
          <Checklist
            pending
            items={[
              "Lid and body proportions drift in some frames",
              "Hair is tied back for the jump and worn down for the drink"
            ]}
          />
        </Panel>
      }
    />
  ),
  delivery: (
    <StepDiagram
      doesLabel="What happens"
      give={frame("final", "Closing frame: she drinks from the olive cup.", "Last frame")}
      does={{
        where: "Review · Delivery",
        title: "Watch with sound, then muted",
        notes: ["Check the final cup, the drink, and the soundtrack ending"]
      }}
      get={
        <Panel title="Finished file">
          <Checklist
            items={["9:16, 720×1280", "15.07 seconds", "AAC stereo sound"]}
          />
          <Note>A flattened video. Its beats and sound are not editable.</Note>
        </Panel>
      }
    />
  )
};
