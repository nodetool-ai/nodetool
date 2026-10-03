import { saveResponseAsFile } from "../downloadResponse";

const responseWith = (body: string, disposition?: string): Response =>
  ({
    blob: async () => new Blob([body]),
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-disposition"
          ? (disposition ?? null)
          : null
    }
  }) as unknown as Response;

describe("saveResponseAsFile", () => {
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let clicked: HTMLAnchorElement[];
  let clickSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    createObjectURL = jest.fn(() => "blob:mock-url");
    revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectURL
    });
    clicked = [];
    clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this);
      });
  });

  afterEach(() => {
    clickSpy.mockRestore();
    jest.useRealTimers();
  });

  it("downloads under the filename the server declares", async () => {
    await saveResponseAsFile(
      responseWith("data", 'attachment; filename="bundle.zip"'),
      "fallback.zip"
    );

    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("bundle.zip");
    expect(clicked[0].href).toBe("blob:mock-url");
  });

  it("falls back when there is no content-disposition header", async () => {
    await saveResponseAsFile(responseWith("data"), "fallback.zip");

    expect(clicked[0].download).toBe("fallback.zip");
  });

  it("falls back when the header carries no filename", async () => {
    await saveResponseAsFile(responseWith("data", "attachment"), "fallback.zip");

    expect(clicked[0].download).toBe("fallback.zip");
  });

  it("reads an unquoted filename", async () => {
    await saveResponseAsFile(
      responseWith("data", "attachment; filename=plain.txt"),
      "fallback.zip"
    );

    expect(clicked[0].download).toBe("plain.txt");
  });

  it("decodes an RFC 5987 filename*", async () => {
    await saveResponseAsFile(
      responseWith("data", "attachment; filename*=UTF-8''my%20workflow.json"),
      "fallback.zip"
    );

    expect(clicked[0].download).toBe("my workflow.json");
  });

  it("hands the response body to the object URL", async () => {
    await saveResponseAsFile(responseWith("payload"), "fallback.zip");

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe("payload".length);
  });

  it("removes the temporary link from the document", async () => {
    await saveResponseAsFile(responseWith("data"), "fallback.zip");

    expect(document.body.querySelector("a[download]")).toBeNull();
  });

  it("revokes the object URL only after a delay", async () => {
    await saveResponseAsFile(responseWith("data"), "fallback.zip");

    expect(revokeObjectURL).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});
