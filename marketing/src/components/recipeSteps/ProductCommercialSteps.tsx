import type { ReactNode } from "react";
import {
  AssignmentGrid,
  Checklist,
  Field,
  Note,
  Panel,
  Quote,
  Row,
  Shots,
  StepDiagram,
  Still,
  Tags,
  Timeline
} from "./StepDiagram";

/*
 * Run 2026-09-14-photographic-commercial. Shot text comes from the storyboard
 * and final edit in recipe-assets/product-commercial-realism-v3/documents/,
 * frames from the finished commercial.mp4, and providers from the run's
 * provider line in scripts/recipes.mjs.
 */

function clip(name: "pour" | "pause" | "leave", alt: string, label?: string) {
  return (
    <div className="min-w-0 flex-1">
      <Still
        src={`commercial/${name}.webp`}
        alt={alt}
        width={480}
        height={270}
        label={label}
      />
    </div>
  );
}

const shots = [
  {
    label: "Pour",
    seconds: 4,
    text: "Coffee pours from the glass carafe into the cup. The level rises and the stream stops before overflow.",
    sound: "pouring, a final drip, quiet kitchen"
  },
  {
    label: "Pause",
    seconds: 4,
    text: "She holds the cup below her chin, breathes, and looks toward the window.",
    sound: "the approved take's own sound"
  },
  {
    label: "Leave",
    seconds: 5,
    text: "She walks away from camera and out through the open doorway, cup in her right hand.",
    sound: "footsteps, quiet outdoor ambience"
  }
];

export const productCommercialSteps: Record<string, ReactNode> = {
  idea: (
    <StepDiagram
      give={
        <Quote>
          Make a 13-second photographic commercial for the Olive Travel Cup:
          pour coffee, pause, then leave home.
        </Quote>
      }
      does={{
        where: "Storyboard · Idea",
        title: "Start from one product moment",
        notes: ["Name the person, place, action, format, and sound"]
      }}
      get={
        <Panel title="What the brief fixes">
          <Field label="Person and place">The same woman, at home</Field>
          <Field label="Product action">Pour, pause, leave</Field>
          <Field label="Format">16:9, 13 seconds</Field>
          <Field label="Sound">Natural location sound, no music</Field>
        </Panel>
      }
    />
  ),
  story: (
    <StepDiagram
      give={<Tags items={["Pour", "Pause", "Leave"]} />}
      does={{
        where: "Storyboard · Story",
        title: "Write one shot per action",
        notes: ["Each shot carries its own sound"]
      }}
      get={<Shots items={shots} />}
    />
  ),
  entities: (
    <StepDiagram
      give={
        <Row>
          <Still
            src="commercial/product.webp"
            alt="Olive Travel Cup product reference."
            width={240}
            height={180}
            size="md"
            label="Olive Travel Cup"
          />
          <Still
            src="commercial/reference.webp"
            alt="The woman standing at the kitchen counter beside the cup."
            width={480}
            height={270}
            size="lg"
            label="Morning kitchen woman"
          />
        </Row>
      }
      does={{
        where: "Storyboard · Entities",
        title: "Attach reusable references",
        notes: ["Every shot that names the cup or the woman uses the same image"]
      }}
      get={
        <AssignmentGrid
          shots={["Pour", "Pause", "Leave"]}
          entities={[
            { name: "Olive Travel Cup", src: "commercial/product.webp", shots: [1, 2, 3] },
            { name: "Morning kitchen woman", src: "commercial/reference.webp", shots: [2, 3] }
          ]}
        />
      }
    />
  ),
  look: (
    <StepDiagram
      give={<Tags items={["16:9", "Soft window light", "Restrained camera"]} />}
      does={{
        where: "Storyboard · Look",
        title: "Set one visual language for every shot"
      }}
      get={
        <Panel title="Board style">
          <p>
            Photographic realism, exact cup proportions and wardrobe, soft
            natural daylight, neutral color, real skin and fabric detail. No
            generated typography.
          </p>
        </Panel>
      }
    />
  ),
  detail: (
    <StepDiagram
      give={<Shots items={shots.slice(0, 1)} />}
      does={{
        where: "Storyboard · References",
        title: "Check the stills before any video",
        notes: ["Look at the cup, the hand, the framing, and continuity"]
      }}
      get={
        <>
          <Row>
            {clip("pour", "Reference still: coffee pouring into the cup beside its lid.", "Pour reference")}
          </Row>
          <Note>
            This example&apos;s pour and doorway references were made with an
            outside image tool and checked on the board.
          </Note>
        </>
      }
    />
  ),
  motion: (
    <StepDiagram
      give={<Tags items={["Approved stills", "Subject, camera, and sound direction"]} />}
      does={{
        where: "Storyboard · Clips",
        title: "Render a clip for each shot",
        notes: [
          "Pause: Seedance 2.0 through Fal",
          "Pour and Leave: supplied from Dreamina"
        ]
      }}
      get={
        <Row align="start">
          {clip("pour", "Coffee fills the cup.", "Pour · 4s")}
          {clip("pause", "She holds the cup and looks toward the window.", "Pause · 4s")}
          {clip("leave", "She walks out through the front door.", "Leave · 5s")}
        </Row>
      }
    />
  ),
  review: (
    <StepDiagram
      give={
        <Row align="start">
          {clip("pour", "Pour clip.")}
          {clip("pause", "Pause clip.")}
          {clip("leave", "Leave clip.")}
        </Row>
      }
      does={{
        where: "Review",
        title: "Judge the movement, with sound",
        notes: ["Motion, hands, cup shape, continuity"]
      }}
      get={
        <Panel title="Selected takes">
          <Checklist
            items={[
              "Pour: the liquid accumulates and the stream stops",
              "Pause: the approved take, same 96 frames and framing",
              "Leave: she walks away from an interior camera through the doorway"
            ]}
          />
        </Panel>
      }
    />
  ),
  timeline: (
    <StepDiagram
      wideResult
      give={<Tags items={["Three selected clips", "Their native sound"]} />}
      does={{
        where: "Timeline",
        title: "Trim, balance, and export",
        notes: ["Short fades at the joins", "No score or voiceover added"]
      }}
      get={
        <Timeline
          duration={13}
          tracks={[
            {
              label: "Picture",
              clips: [
                { start: 0, end: 4, src: "commercial/pour.webp", label: "Pour" },
                { start: 4, end: 8, src: "commercial/pause.webp", label: "Pause" },
                { start: 8, end: 13, src: "commercial/leave.webp", label: "Leave" }
              ]
            },
            {
              label: "Sound",
              clips: [
                { start: 0, end: 4, tone: "sound", label: "Pour" },
                { start: 4, end: 8, tone: "sound", label: "Native" },
                { start: 8, end: 13, tone: "sound", label: "Steps" }
              ]
            }
          ]}
          caption="The saved edit: 13 seconds at 24 fps, enhanced to 2560×1440 with AtlasCloud after approval."
        />
      }
    />
  )
};
