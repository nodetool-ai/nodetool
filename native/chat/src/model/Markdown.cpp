#include "Markdown.h"
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
QVariantList markdownPages(const QString &source) {
  constexpr qsizetype limit = 4096;
  const auto text = cleanHarmony(source);
  const auto lines = text.split('\n');
  QVariantList pages, page;
  qsizetype size = 0;
  auto flush = [&] {
    if (!page.isEmpty()) { pages.append(QVariant(page)); page.clear(); size = 0; }
  };
  auto add = [&](const QString &body, bool code, const QString &language, const QString &copy) {
    if (size + body.size() > limit) { flush(); }
    static const QRegularExpression resourceLink(R"(\[([^\]\n]+)\]\(((?:asset|workflow|app|sketch|timeline|model3d|game|storyboard|thread|script|jsscript|collection)://[A-Za-z0-9._~-]+(?:#[A-Za-z0-9._~-]+=[A-Za-z0-9._~-]+)?)\))");
    qsizetype cursor = 0;
    auto matches = resourceLink.globalMatch(body);
    while (!code && matches.hasNext()) {
      const auto match = matches.next();
      if (match.capturedStart() > cursor) { page.append(QVariantMap{{"text", body.mid(cursor, match.capturedStart() - cursor)}}); }
      const auto uri = match.captured(2);
      page.append(QVariantMap{{"text", match.captured(1)}, {"resourceUri", uri}, {"resourceKind", uri.section(':', 0, 0)}});
      cursor = match.capturedEnd();
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
    for (qsizetype offset = 0; offset < prose.size(); offset += limit) {
      add(prose.mid(offset, limit), false, {}, {});
    }
    prose.clear();
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
      add(table, false, {}, {});
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
