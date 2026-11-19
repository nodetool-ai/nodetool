/**
 * @jest-environment jsdom
 */
describe("share links", () => {
  afterEach(() => {
    delete (window as { api?: unknown }).api;
  });

  it("open on the cloud server in the desktop app's cloud window", () => {
    (window as { api?: unknown }).api = { cloud: { window: { server: "https://nt.example", account: "u1" } } };
    jest.isolateModules(() => {
      const { documentShareUrlForToken } = jest.requireActual("../useDocumentSharing");
      const { shareUrlForToken } = jest.requireActual("../useWorkflowSharing");
      expect(documentShareUrlForToken("tok")).toBe("https://nt.example/share/document/tok");
      expect(shareUrlForToken("tok", "editor")).toBe("https://nt.example/share/tok");
      expect(shareUrlForToken("tok", "public")).toBe("https://nt.example/view/tok");
    });
  });

  it("open on this page's origin everywhere else", () => {
    jest.isolateModules(() => {
      const { documentShareUrlForToken } = jest.requireActual("../useDocumentSharing");
      expect(documentShareUrlForToken("tok")).toBe(`${window.location.origin}/share/document/tok`);
    });
  });
});
