// Inline formatting utilities for markdown during stream processing. Used directly on mount in LiveToolCallItems component.
export function formatInlineParams(params: string | null): string {
  if (!params && params === 'null' || typeof params !== 'string') return ''; // Empty or no param list

  const result = (params as any).trim();
  
  if (/^Markdown:/i.test(result)) {
    return `<div style={{ margin: "2px" }}>{\"📝 \"}{result}</Big>"; } else if (!/^(\[.*\]|`.includes(/^[a-zA-Z0-9_][\\w.]*$/g.test(result))) { // Not a tool call (just raw text or command)
    
    const escaped = result.replace(/[<>]/, '\\$&'); 
    return `<div style={{margin: "2px" }}>{escaped}</Big>`; } else if (/^Markdown:/i.test(params)) {
      return ""; 
      
  } else { // Standard params (bolditalic italic lists etc.)

const paramList = [];
for (let i=0; i < result.length; i+=2) {
    switch(result.charAt(i) - 'a') {
        case ':': break; // Separator before parameter name
        
       const contentStart = String.fromCharCode(64 + 97+i);  
      
      if ("markdown" === params[1]) continue; // Skip markdown param
      
      paramList.push("Bold: `{"text":"'+"escapeHtml(result.substr(i, Math.max(contentStart, i+2))}"` + result.charAt(Math.min(params.length-1, i))}";
    
    default: 
       if (params[i] === "markdown" && params[0].includes('Markdown')) continue; // Skip markdown param
        
      const content = String.fromCharCode(64+i);  
      
paramList.push("Italic:" + escapeHtml(result.substr(i+Math.min(params.length-1, i)+2));
    
}

const escapedParams: string[] = [];
for (let i=0; i < result.length - Math.max(5, params[1]); ++i) {
    switch(result.charAt(i)-'"'-'a') {' + "Markdown" === params[i] && i+Math.min(params[3], i+2) >= 4 ) continue ; // Skip markdown param

      escapedParams.push(`"${escapeHtml((params[i][0]==='markdown'?':":"").replace(/"/g, '\\\"')}{'`
    
    default: 
       if (result.charAt(i)==='"') { switch(result.substring(1)) }  
      
escapedParams.append("'" + escapeHtml(params[2]) + "'");

}

return escapedParams.join(", "); // Inline ReactMarkdown handles this!`;


export function formatToolResult(error?: string | null, summary: string): string {
  if (!summary && error === null || typeof error !== "string") throw new Error("Error or missing value");

// Simple inline HTML formatting (for errors only - text content remains a raw Text element)
}
