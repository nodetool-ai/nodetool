#include "Markdown.h"
#include "RichContent.h"
#include <functional>
#include <QRegularExpression>
#include <QTextBlock>
#include <QTextCursor>
namespace nt::chat {
void styleMarkdownLinks(QTextDocument &document, const QColor &colour) {
  for (auto block = document.begin(); block.isValid(); block = block.next()) {
    for (auto fragment = block.begin(); !fragment.atEnd(); ++fragment) {
      const auto text = fragment.fragment();
      const auto format = text.charFormat();
      if (!format.isAnchor() || format.foreground().color() == colour) { continue; }
      QTextCursor cursor(&document);
      cursor.setPosition(text.position());
      cursor.setPosition(text.position() + text.length(), QTextCursor::KeepAnchor);
      QTextCharFormat link;
      link.setForeground(colour);
      cursor.mergeCharFormat(link);
    }
  }
}
QString cleanHarmony(const QString &source) {
  auto text = source;
  static const QRegularExpression header("<\\|start\\|>[^<]*(?:<\\|channel\\|>[^<]*)?(?:<\\|message\\|>|$)");
  text.remove(header);
  text.remove("<|end|>");
  return text;
}
namespace {
const QString &resourceKinds() {
  static const QString kinds = QStringLiteral("asset|workflow|app|sketch|timeline|model3d|game|storyboard|thread|script|jsscript|collection");
  return kinds;
}
const QString &resourcePattern() {
  static const QString pattern = "(?:" + resourceKinds() + R"()://[A-Za-z0-9._~-]+(?:#[A-Za-z0-9._~-]+=[A-Za-z0-9._~-]+)?)";
  return pattern;
}
bool isResourceUri(const QString &text) {
  static const QRegularExpression exact("^" + resourcePattern() + "$");
  return exact.match(text).hasMatch();
}
// Applies a transform to the text outside inline code spans.
QString outsideCodeSpans(const QString &text, const std::function<QString(const QString &)> &transform) {
  static const QRegularExpression code(R"(`[^`\n]*`)");
  QString out;
  qsizetype cursor = 0;
  auto spans = code.globalMatch(text);
  while (spans.hasNext()) {
    const auto span = spans.next();
    out += transform(text.mid(cursor, span.capturedStart() - cursor)) + span.captured();
    cursor = span.capturedEnd();
  }
  return out + transform(text.mid(cursor));
}
}  // namespace
QVariantList markdownPages(const QString &source) {
  constexpr qsizetype limit = 4096;
  const auto text = cleanHarmony(source);
  const auto lines = text.split('\n');
  QVariantList pages, page;
  qsizetype size = 0;
  auto flush = [&] {
    if (!page.isEmpty()) { pages.append(QVariant(page)); page.clear(); size = 0; }
  };
  auto section = [&](const QVariantMap &entry, qsizetype length) {
    if (size + length > limit) { flush(); }
    page.append(entry);
    size += length;
  };
  // Prose splits into text, images and resource chips: Markdown images,
  // Markdown links to resources, code spans holding only a resource URI, and
  // bare resource URIs, as remarkResourceMentions.ts reads them.
  static const QRegularExpression inlineToken(
      R"(!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"\n]*")?\)|\[([^\]\n]+)\]\(([^)\s]+)\)|`([^`\n]+)`|(?<![\w/"'=])()" + resourcePattern() + ")");
  auto add = [&](const QString &body, bool code, const QString &language, const QString &copy) {
    if (size + body.size() > limit) { flush(); }
    qsizetype cursor = 0;
    auto chip = [&](qsizetype start, const QString &label, const QString &uri) {
      if (start > cursor) { page.append(QVariantMap{{"text", body.mid(cursor, start - cursor)}}); }
      page.append(QVariantMap{{"text", label}, {"resourceUri", uri}, {"resourceKind", uri.section(':', 0, 0)}});
    };
    auto matches = inlineToken.globalMatch(body);
    while (!code && matches.hasNext()) {
      const auto match = matches.next();
      if (match.capturedStart(2) >= 0) {
        if (match.capturedStart() > cursor) { page.append(QVariantMap{{"text", body.mid(cursor, match.capturedStart() - cursor)}}); }
        page.append(QVariantMap{{"text", match.captured(1)}, {"image", match.captured(2)}});
        cursor = match.capturedEnd();
      } else if (match.capturedStart(4) >= 0) {
        if (!isResourceUri(match.captured(4))) { continue; }
        chip(match.capturedStart(), match.captured(3), match.captured(4));
        cursor = match.capturedEnd();
      } else if (match.capturedStart(5) >= 0) {
        const auto uri = match.captured(5).trimmed();
        if (!isResourceUri(uri)) { continue; }
        chip(match.capturedStart(), uri.section("://", 1), uri);
        cursor = match.capturedEnd();
      } else {
        auto uri = match.captured();
        while (uri.endsWith('.')) { uri.chop(1); }
        chip(match.capturedStart(), uri.section("://", 1), uri);
        cursor = match.capturedStart() + uri.size();
      }
    }
    if (cursor < body.size() || body.isEmpty()) {
      page.append(QVariantMap{{"text", body.mid(cursor)}, {"code", code}, {"language", language}, {"copy", copy}});
    }
    size += body.size();
  };
  static const QRegularExpression fence("^ {0,3}(`{3,}|~{3,})(.*)$");
  static const QRegularExpression divider("^\\s*\\|?\\s*:?-{3,}:?\\s*(?:\\|\\s*:?-{3,}:?\\s*)+\\|?\\s*$");
  QString prose;
  auto flushProse = [&] {
    prose = renderInlineMath(outsideCodeSpans(prose, sanitizeChatHtml));
    for (qsizetype offset = 0; offset < prose.size(); offset += limit) {
      add(prose.mid(offset, limit), false, {}, {});
    }
    prose.clear();
  };
  // A display equation: $$ … $$ or \[ … \] opening a line, on one line or
  // across several, as normalizeMathDelimiters in mathMarkdown.ts reads it.
  auto displayMath = [&](qsizetype &i) {
    const auto line = lines[i].trimmed();
    const bool dollars = line.startsWith("$$");
    if (!dollars && !line.startsWith("\\[")) { return false; }
    const QString close = dollars ? QStringLiteral("$$") : QStringLiteral("\\]");
    auto rest = line.mid(2);
    QString tex;
    QString after;
    qsizetype next = i + 1;
    if (const auto end = rest.indexOf(close); end >= 0) {
      tex = rest.left(end);
      after = rest.mid(end + 2);
    } else {
      tex = rest;
      bool closed = false;
      for (; next < lines.size(); ++next) {
        const auto end = lines[next].indexOf(close);
        if (end >= 0) { tex += '\n' + lines[next].left(end); after = lines[next].mid(end + 2); ++next; closed = true; break; }
        tex += '\n' + lines[next];
      }
      if (!closed) { return false; }
    }
    if (tex.trimmed().isEmpty()) { return false; }
    flushProse();
    const auto rendered = texToUnicode(tex);
    section(QVariantMap{{"text", rendered}, {"math", true}, {"source", tex.trimmed()}}, rendered.size());
    if (!after.trimmed().isEmpty()) { prose += after.trimmed() + '\n'; }
    i = next;
    return true;
  };
  for (qsizetype i = 0; i < lines.size();) {
    const auto match = fence.match(lines[i]);
    if (match.hasMatch()) {
      flushProse();
      const auto marker = match.captured(1);
      const auto language = match.captured(2).trimmed().section(' ', 0, 0);
      QString code;
      ++i;
      while (i < lines.size()) {
        const auto end = lines[i].trimmed();
        if (end.size() >= marker.size() && end == QString(end.size(), marker[0])) { ++i; break; }
        code += lines[i++];
        if (i < lines.size()) { code += '\n'; }
      }
      if (code.isEmpty()) { add({}, true, language, code); }
      for (qsizetype offset = 0; offset < code.size(); offset += limit) {
        add(code.mid(offset, limit), true, language, code);
      }
    } else if (displayMath(i)) {
      continue;
    } else if (i + 1 < lines.size() && lines[i].contains('|') && divider.match(lines[i + 1]).hasMatch()) {
      flushProse();
      const auto header = lines[i] + '\n' + lines[i + 1] + '\n';
      auto table = header;
      i += 2;
      while (i < lines.size() && lines[i].contains('|') && !lines[i].trimmed().isEmpty()) {
        if (table.size() + lines[i].size() > limit && table != header) {
          add(table, false, {}, {});
          flush();
          table = header;
        }
        table += lines[i++] + '\n';
      }
      add(renderInlineMath(table), false, {}, {});
    } else {
      prose += lines[i++];
      if (i < lines.size()) { prose += '\n'; }
    }
  }
  flushProse();
  flush();
  if (pages.isEmpty()) { pages.append(QVariant(QVariantList{})); }
  return pages;
}
}
