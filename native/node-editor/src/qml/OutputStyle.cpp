#include "OutputStyle.h"

#include <QList>
#include <QQuickTextDocument>
#include <QTextBlock>
#include <QTextCharFormat>
#include <QTextCursor>
#include <QTextDocument>

namespace nodetool::node_editor::qml {

OutputStyle::OutputStyle(QObject *parent) : QObject(parent) {}

OutputStyle::~OutputStyle() = default;

void OutputStyle::styleMarkdown(QObject *source, const QColor &link, const QColor &codeSurface,
                                const QFont &codeFont) const {
  const auto quickDocument = qobject_cast<QQuickTextDocument *>(source);
  if (!quickDocument || !quickDocument->textDocument()) { return; }
  auto document = quickDocument->textDocument();
  struct Span { int start; int length; QTextCharFormat format; };
  QList<Span> spans;
  for (auto block = document->begin(); block.isValid(); block = block.next()) {
    for (auto it = block.begin(); !it.atEnd(); ++it) {
      const auto fragment = it.fragment();
      auto format = fragment.charFormat();
      const bool code = format.fontFixedPitch() || format.fontFamilies().toStringList().contains("monospace")
          || format.fontFamilies().toStringList().contains(codeFont.family());
      if (format.isAnchor()) { format.setForeground(link); }
      if (code) { format.setFont(codeFont); format.setBackground(codeSurface); }
      if (code || format.isAnchor()) { spans.append({fragment.position(), fragment.length(), format}); }
    }
  }
  for (const auto &span : spans) {
    QTextCursor cursor(document);
    cursor.setPosition(span.start);
    cursor.setPosition(span.start + span.length, QTextCursor::KeepAnchor);
    cursor.mergeCharFormat(span.format);
  }
}

}  // namespace nodetool::node_editor::qml
