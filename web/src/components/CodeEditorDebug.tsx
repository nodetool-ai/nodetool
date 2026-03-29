/** @jsxImportSource @emotion/react */

import { useState } from "react";
import { css } from "@emotion/react";
import TextEditorModal from "./properties/TextEditorModal";

const SAMPLE_JS = `// NodeTool Code Node — Sandbox Environment
// Available: _, fetch, uuid, getSecret, workspace, state

const items = [1, 2, 3, 4, 5];

// Map + filter example
const result = _.chain(items)
  .filter((n) => n % 2 !== 0)
  .map((n) => n * n)
  .value();

// Fetch example
const res = await fetch("https://httpbin.org/json");
const data = await res.json();

return { result, data };
`;

const wrapper = css({
  width: "100vw",
  height: "100vh",
  overflow: "hidden",
  background: "#0a0a0a",
  display: "flex",
  flexDirection: "column",
});

export default function CodeEditorDebug() {
  const [code, setCode] = useState(SAMPLE_JS);

  return (
    <div css={wrapper}>
      <TextEditorModal
        value={code}
        onChange={setCode}
        onClose={() => {}}
        propertyName="code"
        propertyDescription="Debug view for the code editor"
        language="javascript"
        showToolbar={true}
        showStatusBar={true}
        showFindReplace={true}
      />
    </div>
  );
}
