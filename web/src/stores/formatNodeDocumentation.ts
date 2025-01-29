import { highlightText as highlightTextUtil } from "../utils/highlightText";
import { SplitNodeDescription } from "./NodeMenuStore";

export const formatNodeDocumentation = (
  fullDocumentation: string,
  searchTerm?: string,
  searchInfo?: any
): SplitNodeDescription => {
  const lines = fullDocumentation.split("\n").map((line) => line.trim());
  const description = lines[0] || "";
  const tags =
    lines[1]
      ?.split(",")
      .map((t) => t.trim())
      .filter(Boolean) || [];

  // Find section indices
  const useCasesIndex = lines.findIndex((line) =>
    line.startsWith("Use cases:")
  );

  // Extract use cases if present
  let useCasesRaw = "";
  let useCasesHtml = "";
  if (useCasesIndex !== -1) {
    const endIndex = lines.length;
    const useCaseLines = lines
      .slice(useCasesIndex + 1, endIndex)
      .filter((line) => line.trim());

    // Check if we have bullet points
    const hasBullets = useCaseLines.some((line) => line.trim().startsWith("-"));

    if (hasBullets) {
      // Clean bullet points but keep as separate lines
      useCasesRaw = useCaseLines
        .filter((line) => line.trim().startsWith("-"))
        .map((line) => line.replace(/^-\s*/, "").trim())
        .join("\n");
    } else {
      // Join without bullets
      useCasesRaw = useCaseLines.join(" ");
    }

    // Highlight the text
    if (searchTerm && searchInfo) {
      const highlighted = highlightTextUtil(
        useCasesRaw,
        "use_cases",
        searchTerm,
        searchInfo,
        hasBullets // Pass this flag to highlightText
      );
      useCasesHtml = highlighted.html;
    } else {
      useCasesHtml = useCasesRaw;
    }
  }

  return {
    description,
    tags,
    useCases: {
      raw: useCasesRaw,
      html: useCasesHtml
    }
  };
};
