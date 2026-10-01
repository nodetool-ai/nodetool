import { appDocumentFingerprint } from "../merge";
import { createEmptyDocument } from "../appData";

it("treats the saved theme and the editor's seeded theme as the same draft", () => {
  const saved = { ...createEmptyDocument(), theme: { id: "dark" } };
  const seeded = {
    ...saved,
    ui: { ...saved.ui, root: { props: { theme: "dark" } } }
  };
  expect(appDocumentFingerprint(seeded)).toBe(appDocumentFingerprint(saved));
  const edited = {
    ...seeded,
    ui: { ...seeded.ui, root: { props: { theme: "light" } } }
  };
  expect(appDocumentFingerprint(edited)).not.toBe(
    appDocumentFingerprint(saved)
  );
});
