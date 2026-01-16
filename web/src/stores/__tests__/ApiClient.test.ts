import * as ApiClient from "../ApiClient";

describe("ApiClient", () => {
  describe("module structure", () => {
    it("exports isLocalhost as a boolean", () => {
      expect(typeof ApiClient.isLocalhost).toBe("boolean");
    });

    it("exports client object", () => {
      expect(ApiClient.client).toBeDefined();
      expect(typeof ApiClient.client.GET).toBe("function");
      expect(typeof ApiClient.client.POST).toBe("function");
    });
  });
});
