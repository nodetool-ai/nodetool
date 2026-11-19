import { documentFileConstant } from "../documentFileConstant";

describe("documentFileConstant", () => {
  it.each([
    ["workflow", "nodetool.constant.Workflow", { type: "workflow", id: "d1" }],
    ["timeline", "nodetool.constant.Timeline", { type: "timeline", id: "d1" }],
    [
      "storyboard",
      "nodetool.constant.Storyboard",
      { type: "storyboard", id: "d1", data: null }
    ],
    ["script", "nodetool.constant.Script", { type: "script", id: "d1" }],
    [
      "application",
      "nodetool.constant.Application",
      { type: "application", id: "d1" }
    ],
    ["jsscript", "nodetool.constant.JsScript", { type: "jsscript", id: "d1" }],
    [
      "sketch",
      "nodetool.constant.Sketch",
      { type: "sketch", id: "d1", data: null }
    ]
  ] as const)("maps a %s file to %s", (type, nodeType, value) => {
    expect(documentFileConstant(type, "d1")).toEqual({ nodeType, value });
  });
});
