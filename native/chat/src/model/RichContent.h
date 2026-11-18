#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QJsonValue>
#include <QString>
// Pure text transforms for chat message content. They port the web chat's
// Markdown plugins (web/src/components/chat/message/) to plain functions and
// hold no state, so any thread may call them.
namespace nt::chat {
// Keeps the formatting elements and plain attributes of chat HTML, as
// rehypeSanitizeChatHtml.ts does. Scripts, styles, frames, forms, event
// handlers and unsafe link targets are removed. An <img> becomes a Markdown
// image, so it loads through the authenticated media path and never from
// the text document.
QString sanitizeChatHtml(const QString &html);
// Rewrites LaTeX to readable Unicode: Greek letters, operators, fractions,
// roots, sub- and superscripts. Unknown commands keep their source.
QString texToUnicode(const QString &tex);
// Replaces inline \(…\) and one-line $$…$$ math in Markdown prose with
// Unicode, outside code spans. Single dollars stay prices, as on the web.
QString renderInlineMath(const QString &markdown);
// The items of a web search tool result, as parseSearchResults.ts reads
// them: JSON arrays, {results|organic_results|items}, or numbered text with
// URLs. Each item has title and optional url, snippet, source, date. Empty
// when the result is not a search result list.
QJsonArray normalizeSearchResults(const QJsonValue &content);
// The batch of a generate_batch call: the live generation_batch_update, else
// the `batch` of the tool result. Empty when there is none.
QJsonObject generationBatch(const QJsonValue &live, const QJsonValue &result);
// generationBatchProgress.ts at nowMs (epoch milliseconds): done, failed,
// total, percent, remainingSeconds (null once settled) and one row per item
// with its status and timing, as GenerationBatchProgress.tsx shows them.
QJsonObject generationBatchProgress(const QJsonObject &batch, double nowMs);
}
