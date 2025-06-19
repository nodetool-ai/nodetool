// Returns CSS styles for Lexical code highlighting tokens using the provided theme.
export const codeHighlightTokenStyles = (theme: any) => ({
  ".editor-code": {
    backgroundColor: theme.palette.c_gray2,
    fontFamily: "Consolas, 'Courier New', monospace",
    display: "block",
    padding: "8px 12px",
    lineHeight: "1.53",
    fontSize: "13px",
    margin: "8px 0",
    tabSize: 2,
    overflow: "auto",
    borderRadius: "4px"
  },
  ".editor-token-comment": { color: "#999988", fontStyle: "italic" },
  ".editor-token-keyword": { color: "#0000FF" },
  ".editor-token-string": { color: "#d14" },
  ".editor-token-function": { color: "#990000" },
  ".editor-token-number": { color: "#009999" },
  ".editor-token-operator": { color: "#a67f59" },
  ".editor-token-punctuation": { color: "#999999" },
  ".editor-token-property": { color: "#990000" },
  ".editor-token-boolean": { color: "#009999" },
  ".editor-token-selector": { color: "#990000" },
  ".editor-token-class-name": { color: "#445588", fontWeight: "bold" },
  ".editor-token-builtin": { color: "#0086B3" },
  ".editor-token-variable": { color: "#008080" },
  ".editor-token-tag": { color: "#000080" },
  ".editor-token-attr": { color: "#008080" },
  ".editor-token-atrule": { color: "#990000" },
  ".editor-token-regex": { color: "#009926" },
  ".editor-token-important": { color: "#e90", fontWeight: "bold" },
  ".editor-token-entity": { color: "#800080" }
});
