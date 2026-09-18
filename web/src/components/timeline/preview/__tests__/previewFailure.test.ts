import { previewFailureText } from "../previewFailure";

it("retains exception causes but removes signed URLs from diagnostics", () => {
  const text = previewFailureText({
    stage: "renderer-frame",
    resourceId: "clip-one",
    error: new Error("Texture upload failed", {
      cause: new Error(
        "Failed at https://storage.example/private.mp4?signature=secret-value"
      )
    })
  });
  expect(text).toContain("Texture upload failed");
  expect(text).toContain("Caused by:");
  expect(text).toContain("clip-one");
  expect(text).not.toContain("secret-value");
  expect(text).not.toContain("storage.example");
});
