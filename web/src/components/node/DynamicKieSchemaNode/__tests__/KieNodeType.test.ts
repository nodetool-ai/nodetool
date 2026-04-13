import { DYNAMIC_KIE_NODE_TYPE } from "../KieSchemaLoader";

describe("Kie dynamic node type wiring", () => {
  it("uses the real backend Kie node type", () => {
    expect(DYNAMIC_KIE_NODE_TYPE).toBe("kie.dynamic_schema.KieAI");
  });
});
