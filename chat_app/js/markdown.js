/**
 * NodeTool Chat — Lightweight Markdown Renderer
 *
 * Converts a subset of Markdown to safe HTML without any external dependencies.
 * Supported: headings, bold, italic, inline code, fenced code blocks, links,
 * images, blockquotes, horizontal rules, unordered/ordered lists, tables.
 */

(function (root) {
  "use strict";

  /**
   * Escape HTML special characters in a string.
   * @param {string} text
   * @returns {string}
   */
  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Process inline markdown: bold, italic, inline code, links, images.
   * @param {string} text
   * @returns {string} HTML string
   */
  function processInline(text) {
    // Images before links so the ! is consumed
    text = text.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      function (_, alt, src) {
        return '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt) + '" class="message-image" loading="lazy">';
      }
    );

    // Links
    text = text.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      function (_, label, href) {
        return '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener">' + escapeHtml(label) + "</a>";
      }
    );

    // Auto-links
    text = text.replace(
      /\b(https?:\/\/[^\s<"]+)/g,
      function (_, url) {
        return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + escapeHtml(url) + "</a>";
      }
    );

    // Inline code (must come before bold/italic to protect backtick content)
    text = text.replace(/`([^`]+)`/g, function (_, code) {
      return "<code>" + escapeHtml(code) + "</code>";
    });

    // Bold **text** or __text__
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");

    // Italic *text* or _text_
    text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    text = text.replace(/_([^_]+)_/g, "<em>$1</em>");

    // Strikethrough ~~text~~
    text = text.replace(/~~([^~]+)~~/g, "<del>$1</del>");

    return text;
  }

  /**
   * Parse a simple Markdown table.
   * @param {string[]} rows
   * @returns {string} HTML table
   */
  function parseTable(rows) {
    if (rows.length < 2) { return ""; }
    var header = rows[0];
    // rows[1] is the separator row — skip it
    var body = rows.slice(2);

    var parseCells = function (row) {
      return row.split("|").filter(function (_, i, arr) {
        return i !== 0 || arr.length > 1;
      }).map(function (cell) {
        return cell.trim();
      });
    };

    var headerCells = parseCells(header).map(function (cell) {
      return "<th>" + processInline(escapeHtml(cell)) + "</th>";
    }).join("");

    var bodyRows = body.map(function (row) {
      var cells = parseCells(row).map(function (cell) {
        return "<td>" + processInline(escapeHtml(cell)) + "</td>";
      }).join("");
      return "<tr>" + cells + "</tr>";
    }).join("");

    return "<table><thead><tr>" + headerCells + "</tr></thead><tbody>" + bodyRows + "</tbody></table>";
  }

  /**
   * Render Markdown text to an HTML string.
   * @param {string} markdown
   * @returns {string} HTML
   */
  function render(markdown) {
    if (!markdown) { return ""; }

    var lines = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var html = "";
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      // --- Fenced code block ---
      var fenceMatch = line.match(/^```(\w*)/);
      if (fenceMatch) {
        var lang = fenceMatch[1] || "";
        var codeLines = [];
        i++;
        while (i < lines.length && !lines[i].match(/^```/)) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        html += '<pre><code' + (lang ? ' class="language-' + escapeHtml(lang) + '"' : "") + ">" +
          escapeHtml(codeLines.join("\n")) + "</code></pre>";
        continue;
      }

      // --- Heading ---
      var headingMatch = line.match(/^(#{1,6})\s+(.*)/);
      if (headingMatch) {
        var level = headingMatch[1].length;
        html += "<h" + level + ">" + processInline(escapeHtml(headingMatch[2])) + "</h" + level + ">";
        i++;
        continue;
      }

      // --- Horizontal rule ---
      if (line.match(/^[-*_]{3,}\s*$/)) {
        html += "<hr>";
        i++;
        continue;
      }

      // --- Blockquote ---
      if (line.match(/^>\s?/)) {
        var quoteLines = [];
        while (i < lines.length && lines[i].match(/^>\s?/)) {
          quoteLines.push(lines[i].replace(/^>\s?/, ""));
          i++;
        }
        html += "<blockquote>" + render(quoteLines.join("\n")) + "</blockquote>";
        continue;
      }

      // --- Unordered list ---
      if (line.match(/^[-*+]\s/)) {
        var items = [];
        while (i < lines.length && lines[i].match(/^[-*+]\s/)) {
          items.push("<li>" + processInline(escapeHtml(lines[i].replace(/^[-*+]\s/, ""))) + "</li>");
          i++;
        }
        html += "<ul>" + items.join("") + "</ul>";
        continue;
      }

      // --- Ordered list ---
      if (line.match(/^\d+\.\s/)) {
        var oItems = [];
        while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
          oItems.push("<li>" + processInline(escapeHtml(lines[i].replace(/^\d+\.\s/, ""))) + "</li>");
          i++;
        }
        html += "<ol>" + oItems.join("") + "</ol>";
        continue;
      }

      // --- Table ---
      if (line.match(/\|/) && i + 1 < lines.length && lines[i + 1].match(/^\|?\s*[-:]+\s*\|/)) {
        var tableRows = [];
        while (i < lines.length && lines[i].match(/\|/)) {
          tableRows.push(lines[i]);
          i++;
        }
        html += parseTable(tableRows);
        continue;
      }

      // --- Empty line → paragraph break ---
      if (line.trim() === "") {
        html += "<br>";
        i++;
        continue;
      }

      // --- Paragraph ---
      var paraLines = [];
      while (i < lines.length && lines[i].trim() !== "" && !lines[i].match(/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|```|[-*_]{3,})/)) {
        paraLines.push(lines[i]);
        i++;
      }
      if (paraLines.length) {
        html += "<p>" + processInline(escapeHtml(paraLines.join(" "))) + "</p>";
      }
    }

    // Clean up consecutive <br> into a single gap
    html = html.replace(/(<br>\s*){3,}/g, "<br><br>");

    return html;
  }

  // Expose
  root.NTMarkdown = { render: render, escapeHtml: escapeHtml };
})(typeof window !== "undefined" ? window : this);
