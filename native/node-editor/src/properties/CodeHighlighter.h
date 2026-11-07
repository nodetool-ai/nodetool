#pragma once
#include <QSyntaxHighlighter>
#include <QQuickTextDocument>
#include <QColor>
#include <QPointer>
namespace nodetool::node_editor {
void registerCodeHighlighter();
class CodeHighlighter : public QSyntaxHighlighter {
    Q_OBJECT
    Q_PROPERTY(QQuickTextDocument* source READ source WRITE setSource)
    Q_PROPERTY(QColor keyword READ keyword WRITE setKeyword)
    Q_PROPERTY(QColor literal READ literal WRITE setLiteral)
    Q_PROPERTY(QColor comment READ comment WRITE setComment)
public:
    explicit CodeHighlighter(QObject* parent = nullptr) : QSyntaxHighlighter(parent) {}
    QQuickTextDocument* source() const { return source_; }
    void setSource(QQuickTextDocument* source) { source_ = source; setDocument(source ? source->textDocument() : nullptr); }
    QColor keyword() const { return keyword_; }
    QColor literal() const { return literal_; }
    QColor comment() const { return comment_; }
    void setKeyword(QColor value) { keyword_ = value; rehighlight(); }
    void setLiteral(QColor value) { literal_ = value; rehighlight(); }
    void setComment(QColor value) { comment_ = value; rehighlight(); }
protected:
    void highlightBlock(const QString& text) override;
private:
    QPointer<QQuickTextDocument> source_;
    QColor keyword_, literal_, comment_;
};
}
