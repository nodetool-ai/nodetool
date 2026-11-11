import { isComfyExample } from "../useExampleGroups";

it("treats only workflows tagged comfy as ComfyUI examples", () => {
  expect(isComfyExample({ tags: ["comfy", "image", "example"] })).toBe(true);
  expect(isComfyExample({ tags: ["image", "example"] })).toBe(false);
  expect(isComfyExample({ tags: null })).toBe(false);
  expect(isComfyExample({})).toBe(false);
});
