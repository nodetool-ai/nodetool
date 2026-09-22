import { productionRequirement } from "@nodetool-ai/protocol";
import { timelineSetup } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { storyboardDocument } from "@nodetool-ai/protocol/api-schemas/storyboards.js";
import { createTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { readVideoSetupContext } from "../setupContext";
import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";
import {
  productionFields,
  productionPatch,
  productionAuthoringBlocker,
  productionGenerationBlocker,
  reviewFingerprintOf
} from "../productionAuthoring";

const context = {
  schema_version: 1 as const,
  product_name: "Camera",
  product_description: "Pocket camera",
  audience: "Travelers",
  objective: "Show the controls",
  tone: "Direct",
  approved_claims: ["Fits in a pocket"],
  prohibited_claims: ["Waterproof"],
  reference_bindings: [{ kind: "product" as const, asset_id: "asset-1" }]
};
const production = productionRequirement.parse({
  editorial_purpose: "hook",
  requested_take_count: 3,
  local_direction: "Hold the camera",
  duration_ms: 3500
});

it("normalizes legacy context only at the read boundary and preserves origin", () => {
  const context = readVideoSetupContext({
    creativeContext: {
      productName: "Camera",
      approvedClaims: ["Compact"],
      origin: { document_id: "source", document_kind: "script" }
    }
  }).creativeContext;
  expect(context?.product_name).toBe("Camera");
  expect(context?.approved_claims).toEqual(["Compact"]);
  expect(context).not.toHaveProperty("productName");
  expect(context).not.toHaveProperty("approvedClaims");
  expect(context?.origin).toEqual({
    document_id: "source",
    document_kind: "script"
  });
});

it("persists canonical video context and production through the setup schema", () => {
  const store = createTimelineStore();
  store.getState().setSetup({
    stage: "review",
    brief: "Camera demo",
    creative_context: context,
    beats: [{ id: "b", prompt: "Camera", duration_ms: 3500 }]
  });
  store.getState().updateBeat("b", { production });
  const wire = timelineSetup.parse(
    JSON.parse(JSON.stringify(store.getState().setup))
  );
  const restored = createTimelineStore();
  restored.getState().setSetup(wire);
  expect(restored.getState().setup?.creative_context).toEqual(context);
  expect(restored.getState().setup?.beats?.[0].production).toEqual(production);
  expect(wire).not.toHaveProperty("creativeContext");
});

it("stores context before a Storyboard screenplay exists without creating a Script", () => {
  const store = useStoryboardStore.getState();
  store.ensureBoard("authoring-board");
  store.setSetup("authoring-board", {
    stage: "idea",
    creative_context: context
  });
  const board = store.getBoard("authoring-board")!;
  expect(board.shots).toEqual([]);
  expect(board.screenplay).not.toHaveProperty("script_id");
  const wire = storyboardDocument.parse(
    JSON.parse(
      JSON.stringify({
        ...board,
        creative_context: board.creativeContext
      })
    )
  );
  expect(wire.creative_context).toEqual(context);
  expect(wire.screenplay).toHaveProperty("creative_context", context);
  store.setSetup("authoring-board", {
    production_review_fingerprint: "reviewed"
  });
  expect(
    reviewFingerprintOf(store.getBoard("authoring-board")?.screenplay)
  ).toBe("reviewed");
  expect(store.getBoard("authoring-board")?.creativeContext).toEqual(context);
  store.removeBoard("authoring-board");
});

it("keeps legacy documents unchanged until an authoring field is edited", () => {
  const store = createTimelineStore();
  store.getState().setSetup({
    stage: "look",
    brief: "Demo",
    beats: [{ id: "b", prompt: "Camera", duration_ms: 3000 }]
  });
  const before = JSON.stringify(store.getState().setup);
  productionFields({
    id: "b",
    value: store.getState().setup?.beats?.[0],
    speechText: "",
    onChange: jest.fn()
  });
  expect(JSON.stringify(store.getState().setup)).toBe(before);
  expect(
    productionGenerationBlocker(store.getState().setup?.beats ?? [], false)
  ).toBeUndefined();
});

it.each([0, 4, -1, 1.5, NaN])(
  "rejects take count %s before storage",
  (count) => {
    expect(() =>
      productionPatch(undefined, { requested_take_count: count })
    ).toThrow();
    expect(
      productionAuthoringBlocker([
        { production: { requested_take_count: count } }
      ])
    ).toContain("1–3");
  }
);

it.each([1, 2, 3])("accepts take count %s", (count) => {
  expect(
    productionPatch(undefined, { requested_take_count: count })
      .requested_take_count
  ).toBe(count);
});

it("binds linked speech by line ID without copying dialogue", () => {
  const onChange = jest.fn();
  const fields = productionFields({
    id: "s",
    value: {},
    speechText: "Copied words",
    linkedLineIds: ["line-1"],
    onChange
  });
  fields.find((field) => field.label === "Speech mode")!.onChange("on_camera");
  expect(onChange.mock.calls[0][0].speech_binding).toEqual({
    script_line_id: "line-1"
  });
});

it("explains missing local speech and disables mode selection", () => {
  const fields = productionFields({
    id: "b",
    value: {},
    speechText: "",
    onChange: jest.fn()
  });
  expect(fields.find((field) => field.label === "Speech mode")?.readOnly).toBe(
    true
  );
  // The binding reads under the control it explains, not in a read-only field
  // of its own that looks like a value the creator typed.
  expect(
    fields.find((field) => field.label === "Speech binding")
  ).toBeUndefined();
  expect(fields.find((field) => field.label === "Speech mode")?.hint).toContain(
    "Add voiceover or dialogue"
  );
});

it("marks on-camera speech unavailable at selection with an actionable alternative", () => {
  const fields = productionFields({
    id: "b",
    value: {},
    speechText: "Hello",
    onChange: jest.fn()
  });
  const speech = fields.find((field) => field.label === "Speech mode");
  expect(speech?.options).toContainEqual({
    value: "on_camera",
    label: "On-camera (unavailable in guided flow)",
    disabled: true
  });
  expect(speech?.hint).toContain("Choose Off-camera or None");
});

it("allows supported references and alternatives but blocks unsupported on-camera speech", () => {
  expect(productionGenerationBlocker([{ production }], false)).toBeUndefined();
  expect(productionGenerationBlocker([], true)).toBeUndefined();
  expect(
    productionGenerationBlocker(
      [
        {
          production: productionRequirement.parse({
            speech_mode: "on_camera",
            speech_binding: { text: "Hello" }
          })
        }
      ],
      false
    )
  ).toBe(
    "On-camera speech is unavailable in this guided flow. Choose Off-camera or None."
  );
});
