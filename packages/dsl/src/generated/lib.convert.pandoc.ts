// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Convert File — lib.convert.pandoc.ConvertFile
export interface ConvertFileInputs {
  input_path?: Connectable<unknown>;
  input_format?: Connectable<"biblatex" | "bibtex" | "bits" | "commonmark" | "commonmark_x" | "creole" | "csljson" | "csv" | "djot" | "docbook" | "docx" | "dokuwiki" | "endnotexml" | "epub" | "fb2" | "gfm" | "haddock" | "html" | "ipynb" | "jats" | "jira" | "json" | "latex" | "man" | "markdown" | "markdown_github" | "markdown_mmd" | "markdown_phpextra" | "markdown_strict" | "mdoc" | "mediawiki" | "muse" | "native" | "odt" | "opml" | "org" | "ris" | "rst" | "rtf" | "t2t" | "textile" | "tikiwiki" | "tsv" | "twiki" | "typst" | "vimwiki">;
  output_format?: Connectable<"asciidoc" | "asciidoctor" | "beamer" | "context" | "docbook4" | "docbook5" | "docx" | "epub2" | "epub3" | "pdf" | "plain" | "pptx" | "slideous" | "slidy" | "dzslides" | "revealjs" | "s5" | "tei" | "texinfo" | "zimwiki">;
  extra_args?: Connectable<string[]>;
}

export interface ConvertFileOutputs {
  output: string;
}

export function convertFile(inputs: ConvertFileInputs): DslNode<ConvertFileOutputs, "output"> {
  return createNode("lib.convert.pandoc.ConvertFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Convert Text — lib.convert.pandoc.ConvertText
export interface ConvertTextInputs {
  content?: Connectable<string>;
  input_format?: Connectable<"biblatex" | "bibtex" | "bits" | "commonmark" | "commonmark_x" | "creole" | "csljson" | "csv" | "djot" | "docbook" | "docx" | "dokuwiki" | "endnotexml" | "epub" | "fb2" | "gfm" | "haddock" | "html" | "ipynb" | "jats" | "jira" | "json" | "latex" | "man" | "markdown" | "markdown_github" | "markdown_mmd" | "markdown_phpextra" | "markdown_strict" | "mdoc" | "mediawiki" | "muse" | "native" | "odt" | "opml" | "org" | "ris" | "rst" | "rtf" | "t2t" | "textile" | "tikiwiki" | "tsv" | "twiki" | "typst" | "vimwiki">;
  output_format?: Connectable<"asciidoc" | "asciidoctor" | "beamer" | "context" | "docbook4" | "docbook5" | "docx" | "epub2" | "epub3" | "pdf" | "plain" | "pptx" | "slideous" | "slidy" | "dzslides" | "revealjs" | "s5" | "tei" | "texinfo" | "zimwiki">;
  extra_args?: Connectable<string[]>;
}

export interface ConvertTextOutputs {
  output: string;
}

export function convertText(inputs: ConvertTextInputs): DslNode<ConvertTextOutputs, "output"> {
  return createNode("lib.convert.pandoc.ConvertText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
