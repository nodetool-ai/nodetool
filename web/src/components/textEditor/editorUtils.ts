// In the future, we will add functions here to convert
// Slate.js data to Lexical and vice-versa.

export const convertSlateToLexical = (slateData: any): string => {
  // For now, just extract the plain text as a starting point.
  // This is a placeholder and will need to be made more robust.
  try {
    if (Array.isArray(slateData) && slateData.length > 0) {
      const text = slateData
        .map((node: any) =>
          node.children.map((child: any) => child.text).join("\n")
        )
        .join("\n");

      return JSON.stringify({
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: "normal",
                  style: "",
                  text: text,
                  type: "text",
                  version: 1
                }
              ],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "paragraph",
              version: 1
            }
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          type: "root",
          version: 1
        }
      });
    }
  } catch (e) {
    console.error("Error converting Slate to Lexical:", e);
  }

  // Return a default empty state if conversion fails
  return JSON.stringify({
    root: {
      children: [{ type: "paragraph", children: [{ type: "text", text: "" }] }]
    }
  });
};
