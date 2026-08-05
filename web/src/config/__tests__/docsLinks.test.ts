import fs from "fs";
import path from "path";
import { DOCS_BASE_URL, DOCS_PATHS, docsLink, docsUrl } from "../docsLinks";

const DOCS_DIR = path.resolve(__dirname, "../../../../docs");

describe("docsLinks", () => {
  it("builds absolute docs URLs", () => {
    expect(docsUrl("workflow-editor")).toBe(
      `${DOCS_BASE_URL}/workflow-editor`
    );
    expect(docsUrl("/workflow-editor")).toBe(
      `${DOCS_BASE_URL}/workflow-editor`
    );
    expect(docsLink("collections")).toBe(`${DOCS_BASE_URL}/collections`);
  });

  // A help icon pointing at a page that no longer exists is worse than no icon.
  it.each(Object.entries(DOCS_PATHS))(
    "%s resolves to a page that ships in docs/",
    (_topic, docPath) => {
      const target = path.join(DOCS_DIR, docPath.replace(/\/$/, ""));
      const exists =
        fs.existsSync(`${target}.md`) ||
        (fs.existsSync(target) && fs.statSync(target).isDirectory());
      expect(exists).toBe(true);
    }
  );
});
