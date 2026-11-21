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
  Tags
} from "./StepDiagram";

/*
 * Run 2026-09-10-marketing-recipes-01, ecommerce-sku-visual-factory. Shot
 * names, style, and models come from documents/production-board.json,
 * listing text from documents/listing-copy.md, and limits from handoff.md.
 */

function view(
  name: "product" | "cutout" | "studio" | "winter" | "motion",
  alt: string,
  label: string,
  size: "md" | "lg" | "full" = "full"
) {
  const square = name !== "product" && name !== "cutout";
  return (
    <Still
      src={`catalogue/${name}.webp`}
      alt={alt}
      width={320}
      height={square ? 320 : 240}
      size={size}
      label={label}
      checker={name === "cutout"}
    />
  );
}

const productPhoto = view(
  "product",
  "Olive travel cup photographed on a white background.",
  "Product photo",
  "lg"
);

const shotNames = ["Studio Hero", "Winter-Light Catalogue", "Three-Quarter Motion View"];

export const productCatalogueSteps: Record<string, ReactNode> = {
  source: (
    <StepDiagram
      give={productPhoto}
      does={{
        where: "Agent · Cutout",
        title: "Keep one reference, cut it out if needed",
        notes: ["The same photo anchors every view in the set"]
      }}
      get={
        <>
          {view("cutout", "The cup cut out on a transparent background.", "Transparent cutout", "lg")}
          <Note>Optional. Check it on light and dark backgrounds.</Note>
        </>
      }
    />
  ),
  idea: (
    <StepDiagram
      give={
        <Quote>
          Create three square catalogue views of the Olive Travel Cup. A clean
          studio hero on a pale limestone plinth, a winter-light scene…, and a
          three-quarter hero for a short camera move.
        </Quote>
      }
      does={{
        where: "Storyboard · Idea",
        title: "Describe the whole set at once",
        notes: ["Say what must stay the same in every view"]
      }}
      get={<Tags items={["Studio hero", "Winter light", "Three-quarter view", "Same olive body and charcoal lid"]} />}
    />
  ),
  story: (
    <StepDiagram
      give={<Tags items={["Commercial", "3 shots"]} />}
      does={{
        where: "Storyboard · Story",
        title: "Generate a screenplay of three views"
      }}
      get={
        <Shots
          items={[
            { label: shotNames[0], seconds: 4 },
            { label: shotNames[1], seconds: 4 },
            { label: shotNames[2], seconds: 6 }
          ]}
        />
      }
    />
  ),
  review: (
    <StepDiagram
      give={<Shots items={shotNames.map((label) => ({ label }))} />}
      does={{
        where: "Storyboard · Story",
        title: "Give each view one purpose",
        notes: ["Edit the descriptions before any still is rendered"]
      }}
      get={
        <Panel title="Kept the same across the set">
          <Checklist items={["Product", "Scale", "Lighting direction"]} />
        </Panel>
      }
    />
  ),
  entities: (
    <StepDiagram
      give={
        <Panel title="Product entity">
          <Row>
            {view("product", "The product reference photo.", "Olive Travel Cup", "md")}
          </Row>
        </Panel>
      }
      does={{
        where: "Storyboard · Entities",
        title: "Assign one product to every shot"
      }}
      get={
        <AssignmentGrid
          shots={["Studio", "Winter", "3/4"]}
          entities={[{ name: "Olive Travel Cup", src: "catalogue/product.webp", shots: [1, 2, 3] }]}
        />
      }
    />
  ),
  look: (
    <StepDiagram
      give={<Tags items={["1:1", "Photographic", "Model that accepts references"]} />}
      does={{
        where: "Storyboard · Look",
        title: "Set format and models once for the board"
      }}
      get={
        <Panel title="Board settings in this example">
          <Field label="Aspect ratio">1:1</Field>
          <Field label="Style">
            Studio photography on an 85mm at f/8, large softbox key with a
            white bounce fill, seamless sweep background
          </Field>
          <Field label="Image model">Flux2Max Edit (fal)</Field>
          <Field label="Video model">Seedance V1 Lite image-to-video (fal)</Field>
        </Panel>
      }
    />
  ),
  stills: (
    <StepDiagram
      give={<Shots items={shotNames.map((label) => ({ label }))} />}
      does={{
        where: "Storyboard · Stills",
        title: "Render and compare the three views",
        notes: ["Check lid, silhouette, colour, and shadows", "Re-render only the view that fails"]
      }}
      get={
        <>
          <div className="grid grid-cols-3 gap-2">
            {view("studio", "The cup on a pale plinth in soft studio light.", "Studio")}
            {view("winter", "The cup on a snowy ledge in front of pine branches.", "Winter light")}
            {view("motion", "The cup at three-quarter view on a dark plinth.", "Three-quarter")}
          </div>
          <Note>
            The accepted views, generated from the same product reference.
          </Note>
        </>
      }
    />
  ),
  motion: (
    <StepDiagram
      give={view("motion", "The three-quarter view chosen for motion.", "Three-quarter view", "lg")}
      does={{
        where: "Storyboard · Clip",
        title: "Animate one view with a small camera arc",
        notes: ["Check product edges and shape through the clip"]
      }}
      get={
        <>
          <Still
            src="/recipes/runs/2026-09-10-marketing-recipes-01/ecommerce-sku-visual-factory/product-motion-poster.webp"
            alt="First frame of the product motion clip."
            width={1440}
            height={1440}
            size="lg"
            label="6-second silent clip"
          />
          <Note>A short camera arc, not a full 360-degree turn.</Note>
        </>
      }
    />
  ),
  delivery: (
    <StepDiagram
      give={view("studio", "The accepted studio still.", "Studio still", "lg")}
      does={{
        where: "Agent",
        title: "Prepare the listing assets",
        notes: ["Upscale, web copies, listing text from verified facts"]
      }}
      get={
        <Panel title="Delivery set">
          <Field label="Print master">4096×4096 upscale of the studio still</Field>
          <Field label="Listing title">Muted-Olive Unbranded Travel Cup</Field>
          <Field label="Flagged as unknown">
            Capacity, materials, insulation, dimensions, price, and other
            facts to confirm before publishing
          </Field>
        </Panel>
      }
    />
  )
};
