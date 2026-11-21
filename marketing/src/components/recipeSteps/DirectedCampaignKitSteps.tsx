import type { ReactNode } from "react";
import {
  Field,
  Note,
  Panel,
  Row,
  StepDiagram,
  Still,
  Tags
} from "./StepDiagram";

/*
 * Run 2026-09-14-directed-campaign-kit-gpt25. Field labels and stage text come
 * from the Directed Campaign Kit app; prompts come from the run's prompt.txt
 * and asset-manifest.json.
 */

const product = (
  <Still
    src="campaign/product.webp"
    alt="Olive travel cup with a charcoal lid on an off-white background."
    width={280}
    height={420}
    size="sm"
    label="Product image (required)"
  />
);

const hero = (
  <Still
    src="campaign/hero.webp"
    alt="Wide campaign hero: the olive cup on a cobalt platform above mirrored water at an amber sunrise."
    width={640}
    height={360}
    label="Accepted 16:9 hero"
  />
);

const chosenDirection = (
  <Panel title="Chosen direction in this example">
    <p>
      An olive cup on a cobalt circular platform above mirrored water, framed
      by monumental curved architecture and an amber mountain sunrise.
    </p>
  </Panel>
);

export const directedCampaignKitSteps: Record<string, ReactNode> = {
  upload: (
    <StepDiagram
      give={
        <Row>
          {product}
          <Panel title="Campaign prompt (optional)">
            <p className="text-slate-300">
              For example: premium but outdoorsy, aimed at design-conscious
              commuters
            </p>
          </Panel>
        </Row>
      }
      does={{
        where: "Directed Campaign Kit · Brief",
        title: "Reads the product and writes the campaign",
        notes: [
          "Uploading the image starts the analysis",
          "A multimodal language model fills the brief and proposes three directions"
        ]
      }}
      get={
        <Panel title="Filled in for you">
          <Tags
            items={[
              "Product name",
              "Campaign message",
              "Audience",
              "Exact headline",
              "Exact CTA",
              "Directions A, B, C"
            ]}
          />
          <Note>No image is generated yet.</Note>
        </Panel>
      }
    />
  ),
  review: (
    <StepDiagram
      give={
        <Panel title="Brief for this example">
          <Field label="Product name">Olive travel cup (fictional)</Field>
          <Field label="Audience">
            Design-conscious commuters who want everyday objects to feel
            energizing
          </Field>
          <Field label="Campaign message">Carry momentum into the day</Field>
        </Panel>
      }
      does={{
        where: "Directed Campaign Kit · Brief",
        title: "You check and correct the brief",
        notes: [
          "Type the headline and CTA yourself when the words must be exact",
          "Analyzing again keeps every field you filled in"
        ]
      }}
      get={
        <Panel title="Approved brief">
          <Field label="Exact headline">Your words, used as typed</Field>
          <Field label="Exact CTA">Your words, used as typed</Field>
          <Note>
            The brief now feeds the three directions and every later render.
          </Note>
        </Panel>
      }
    />
  ),
  direction: (
    <StepDiagram
      give={
        <div className="space-y-2">
          <Panel title="Direction A">Direct and iconic</Panel>
          <Panel title="Direction B">Atmospheric and editorial</Panel>
          <Panel title="Direction C">Graphic or unexpected</Panel>
        </div>
      }
      does={{
        where: "Directed Campaign Kit · Direction",
        title: "You choose one route",
        notes: [
          "The three directions are written, not rendered",
          "Pick the one that gives the product a clear role"
        ]
      }}
      get={chosenDirection}
    />
  ),
  hero: (
    <StepDiagram
      give={
        <Row>
          {product}
          <div className="min-w-0 flex-1">{chosenDirection}</div>
        </Row>
      }
      does={{
        where: "Directed Campaign Kit · Hero",
        title: "Renders the 16:9 hero",
        notes: [
          "This run used GPT Image 2.5 Sunburst through AtlasCloud",
          "Compare shape, lid, logo, color, camera, and surface with the product image before you accept"
        ]
      }}
      get={
        <>
          {hero}
          <Note>
            2048×1152, with dark-blue space on the left for copy added
            outside the artwork.
          </Note>
        </>
      }
    />
  ),
  formats: (
    <StepDiagram
      give={hero}
      does={{
        where: "Directed Campaign Kit · Formats",
        title: "Recomposes the accepted hero for social",
        notes: [
          "Keeps the cup, platform, water, sunrise, and grade",
          "Leaves clear space for copy in each format",
          "This run used the matching GPT Image 2.5 edit model"
        ]
      }}
      get={
        <Row>
          <Still
            src="campaign/square.webp"
            alt="Square version of the campaign with the cup on the cobalt platform."
            width={320}
            height={320}
            size="lg"
            label="1:1 social"
          />
          <Still
            src="campaign/story.webp"
            alt="Vertical story version with the cup below the mountain sunrise."
            width={220}
            height={391}
            size="sm"
            label="9:16 story"
          />
        </Row>
      }
    />
  ),
  revision: (
    <StepDiagram
      give={
        <Panel title="Direct one revision">
          <Field label="Change">
            Reduce the water splash by about half and widen the clean
            dark-blue copy space on the left.
          </Field>
          <Field label="Preserve">The product, set, palette, and camera</Field>
        </Panel>
      }
      does={{
        where: "Directed Campaign Kit · Revision",
        title: "Renders Revision 1 beside the original",
        notes: ["The accepted original stays untouched until you choose"]
      }}
      get={
        <>
          <Row>
            <div className="min-w-0 flex-1">
              <Still
                src="campaign/hero.webp"
                alt="Original hero with a large splash around the platform."
                width={640}
                height={360}
                label="Original"
              />
            </div>
            <div className="min-w-0 flex-1">
              <Still
                src="campaign/revision.webp"
                alt="Revised hero with a smaller splash and wider dark space on the left."
                width={640}
                height={360}
                label="Revision 1"
              />
            </div>
          </Row>
          <Tags items={["Keep original", "Accept revision and build formats"]} />
        </>
      }
    />
  )
};
