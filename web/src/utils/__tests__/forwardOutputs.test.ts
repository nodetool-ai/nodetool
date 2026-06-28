import { forwardInputHandle, isForwardInput } from "../forwardOutputs";
import { REROUTE_NODE_TYPE } from "../../constants/nodeTypes";

describe("forwardOutputs", () => {
  describe("forwardInputHandle", () => {
    it("maps a Reroute output to its input", () => {
      expect(forwardInputHandle(REROUTE_NODE_TYPE, "output")).toBe(
        "input_value"
      );
    });

    it("maps both If outputs to the forwarded 'value' input", () => {
      expect(forwardInputHandle("nodetool.control.If", "if_true")).toBe("value");
      expect(forwardInputHandle("nodetool.control.If", "if_false")).toBe(
        "value"
      );
    });

    it("maps Switch outputs to the forwarded 'input'", () => {
      expect(forwardInputHandle("nodetool.control.Switch", "matched")).toBe(
        "input"
      );
      expect(forwardInputHandle("nodetool.control.Switch", "default")).toBe(
        "input"
      );
    });

    it("returns undefined for non-forward nodes/handles", () => {
      expect(forwardInputHandle("nodetool.image.Blur", "output")).toBeUndefined();
      expect(forwardInputHandle(REROUTE_NODE_TYPE, "nope")).toBeUndefined();
      expect(forwardInputHandle(undefined, "output")).toBeUndefined();
    });
  });

  describe("isForwardInput", () => {
    it("recognizes passthrough inputs", () => {
      expect(isForwardInput(REROUTE_NODE_TYPE, "input_value")).toBe(true);
      expect(isForwardInput("nodetool.control.If", "value")).toBe(true);
      expect(isForwardInput("nodetool.control.Switch", "input")).toBe(true);
    });

    it("rejects non-passthrough inputs and unknown nodes", () => {
      expect(isForwardInput("nodetool.control.If", "condition")).toBe(false);
      expect(isForwardInput("nodetool.image.Blur", "image")).toBe(false);
      expect(isForwardInput(undefined, "value")).toBe(false);
    });
  });
});
