import type { ReactNode } from "react";
import {
  Checklist,
  Note,
  Panel,
  Quote,
  Row,
  StepDiagram,
  Still,
  Tags,
  Timeline
} from "./StepDiagram";

/*
 * Run 2026-09-14-emotional-support-cup. Frames come from the supplied final
 * MP4, the lines from its transcript.txt, and the cut points from FFmpeg scene
 * detection on that file. The MP4 records no provider or model, so no step
 * names one.
 */

function frame(name: string, alt: string, label?: string, size: "xs" | "sm" = "sm") {
  return (
    <Still
      src={`ugc/${name}.webp`}
      alt={alt}
      width={240}
      height={426}
      size={size}
      label={label}
    />
  );
}

const productImage = (
  <Still
    src="ugc/product.webp"
    alt="Olive travel cup with a grey lid on a plain background."
    width={240}
    height={180}
    size="md"
    label="Product image"
  />
);

export const ugcProductVideoSteps: Record<string, ReactNode> = {
  angle: (
    <StepDiagram
      giveLabel="Starts with"
      give={
        <Quote>
          I bought this because it&apos;s green, which is ridiculous because I
          already have six.
        </Quote>
      }
      does={{
        where: "UGC Product Video · Angle",
        title: "Turn a confession into a three-part story",
        notes: ["The last line answers the first"]
      }}
      get={
        <div className="grid grid-cols-3 gap-2">
          {frame("hook", "The creator holds up the cup in her kitchen.", "Confession")}
          {frame("street", "The cup in her hand on a busy street.", "Chaos")}
          {frame("evening", "The creator smiles at home in warm light, holding the cup.", "Verdict")}
        </div>
      }
    />
  ),
  creator: (
    <StepDiagram
      give={frame(
        "creator",
        "The creator talks to a front phone camera in a bright kitchen.",
        "Creator image"
      )}
      does={{
        where: "UGC Product Video · References",
        title: "Fix who appears in every cut",
        notes: [
          "Front camera, clear face, window light",
          "Same hair and charcoal sweatshirt all day"
        ]
      }}
      get={
        <>
          <Row>
            {frame("hook", "Kitchen, morning.", "Kitchen", "xs")}
            {frame("work", "At a desk, drinking from the cup.", "Work", "xs")}
            {frame("evening", "At home in the evening.", "Evening", "xs")}
          </Row>
          <Note>The same creator in three locations of the finished video.</Note>
        </>
      }
    />
  ),
  product: (
    <StepDiagram
      give={productImage}
      does={{
        where: "UGC Product Video · References",
        title: "Fix the product separately",
        notes: ["Silhouette, finish, lid, and proportions come from this image"]
      }}
      get={
        <>
          <Row>
            {frame("street", "Close view of the cup in her hand outdoors.", "Street", "xs")}
            {frame("work", "The cup at her desk.", "Desk", "xs")}
            {frame("pause", "The cup beside her on a park bench.", "Bench", "xs")}
          </Row>
          <Note>
            The cup in three scenes. The run record notes that the lid and
            body shift slightly with lighting and framing.
          </Note>
        </>
      }
    />
  ),
  dialogue: (
    <StepDiagram
      give={
        <Panel title="Visible actions in the brief">
          <Checklist
            items={[
              "She leaves home with the cup",
              "Carries it through town",
              "Drinks at work",
              "Pauses outdoors",
              "Ends at home holding it close"
            ]}
          />
        </Panel>
      }
      does={{
        where: "UGC Product Video · Generate",
        title: "Render picture and voice together",
        notes: [
          "Needs a video model with native audio",
          "Creator and product images go in as references"
        ]
      }}
      get={
        <Row>
          {frame("leave", "She walks out through the back door.", "0:03 Leaves", "xs")}
          {frame("street", "The cup on the street.", "0:06 Town", "xs")}
          {frame("work", "She drinks at her desk.", "0:08 Work", "xs")}
          {frame("pause", "A pause on a park bench.", "0:11 Outdoors", "xs")}
        </Row>
      }
    />
  ),
  finish: (
    <StepDiagram
      wideResult
      give={
        <Panel title="Spoken line">
          <Quote>
            … this morning got a bit chaotic, and suddenly it was my emotional
            support cup.
          </Quote>
        </Panel>
      }
      does={{
        where: "Timeline",
        title: "Let one voice run across the cuts",
        notes: ["Keep location sound", "No music and no captions"]
      }}
      get={
        <Timeline
          duration={15.017}
          tracks={[
            {
              label: "Picture",
              clips: [
                { start: 0, end: 1.8, src: "ugc/creator.webp", label: "Kitchen" },
                { start: 1.8, end: 5.08, src: "ugc/leave.webp", label: "Out" },
                { start: 5.08, end: 7.47, src: "ugc/street.webp", label: "Street" },
                { start: 7.47, end: 10, src: "ugc/work.webp", label: "Work" },
                { start: 10, end: 12.05, src: "ugc/pause.webp", label: "Park" },
                { start: 12.05, end: 15.017, src: "ugc/evening.webp", label: "Home" }
              ]
            },
            {
              label: "Voice",
              clips: [
                {
                  start: 0,
                  end: 15.017,
                  tone: "voice",
                  label: "One continuous first-person line"
                }
              ]
            }
          ]}
          caption="Cut points measured from the finished 15-second video."
        />
      }
    />
  ),
  inspect: (
    <StepDiagram
      give={frame(
        "evening",
        "Closing frame: the creator smiles at home holding the cup.",
        "Closing frame"
      )}
      does={{
        where: "Review",
        title: "Watch with sound, then muted",
        notes: ["Regenerate only what fails"]
      }}
      get={
        <Panel title="Check before you approve">
          <Checklist
            items={[
              "The voice carries across every cut",
              "Same creator and cup in each place",
              "Cup shape and lid hold up close",
              "The last smile answers the opening confession"
            ]}
          />
          <Tags items={["Approve", "Regenerate"]} />
        </Panel>
      }
    />
  )
};
