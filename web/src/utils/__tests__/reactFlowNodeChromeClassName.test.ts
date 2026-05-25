/**
 * @jest-environment node
 */
import { reactFlowNodeChromeClassName } from "../reactFlowNodeChromeClassName";

describe("reactFlowNodeChromeClassName", () => {
  it("returns undefined when neither flag is set", () => {
    expect(reactFlowNodeChromeClassName({})).toBeUndefined();
  });

  it("returns undefined when both flags are explicitly false", () => {
    expect(
      reactFlowNodeChromeClassName({ bypassed: false, collapsed: false })
    ).toBeUndefined();
  });

  it("returns 'bypassed' when only bypassed is true", () => {
    expect(reactFlowNodeChromeClassName({ bypassed: true })).toBe("bypassed");
  });

  it("returns 'collapsed' when only collapsed is true", () => {
    expect(reactFlowNodeChromeClassName({ collapsed: true })).toBe("collapsed");
  });

  it("returns both classes when both flags are true", () => {
    expect(
      reactFlowNodeChromeClassName({ bypassed: true, collapsed: true })
    ).toBe("bypassed collapsed");
  });

  it("returns 'bypassed' when bypassed is true and collapsed is false", () => {
    expect(
      reactFlowNodeChromeClassName({ bypassed: true, collapsed: false })
    ).toBe("bypassed");
  });

  it("returns 'collapsed' when collapsed is true and bypassed is false", () => {
    expect(
      reactFlowNodeChromeClassName({ bypassed: false, collapsed: true })
    ).toBe("collapsed");
  });

  it("returns undefined when flags are undefined", () => {
    expect(
      reactFlowNodeChromeClassName({
        bypassed: undefined,
        collapsed: undefined
      })
    ).toBeUndefined();
  });
});
