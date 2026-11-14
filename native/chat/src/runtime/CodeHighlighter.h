#pragma once
#include <QPointer>
#include <QQuickTextDocument>
#include <QSyntaxHighlighter>
#include <QtQml/qqmlregistration.h>
namespace nt::chat {
// Colours a chat code fence with the web CodeBlock's One Dark and One Light
// palettes (codeBlockColors.ts). Token rules follow the language family of
// the fence's info string. UI thread only. The highlighter is a child of
// the QML item that declares it and borrows the item's text document.
class CodeHighlighter : public QSyntaxHighlighter {
  Q_OBJECT
  QML_NAMED_ELEMENT(ChatCodeHighlighter)
  Q_PROPERTY(QQuickTextDocument *source READ source WRITE setSource NOTIFY changed)
  Q_PROPERTY(QString language READ language WRITE setLanguage NOTIFY changed)
  Q_PROPERTY(bool dark READ dark WRITE setDark NOTIFY changed)
public:
  explicit CodeHighlighter(QObject *parent = nullptr) : QSyntaxHighlighter(parent) {}
  QQuickTextDocument *source() const { return m_source; }
  void setSource(QQuickTextDocument *source);
  QString language() const { return m_language; }
  void setLanguage(const QString &language);
  bool dark() const { return m_dark; }
  void setDark(bool dark);
  // The language family a fence info string selects, such as "c" for cpp
  // or "markup" for html. Empty when no rules apply.
  static QString family(const QString &language);
signals:
  void changed();

protected:
  void highlightBlock(const QString &text) override;

private:
  QPointer<QQuickTextDocument> m_source;
  QString m_language;
  QString m_family;
  bool m_dark = true;
};
}  // namespace nt::chat
