#include "CodeHighlighter.h"
#include <QCoreApplication>
#include <QQmlEngine>
#include <QRegularExpression>
namespace nodetool::node_editor {
void CodeHighlighter::highlightBlock(const QString& text) {
    static const QRegularExpression tokens(QStringLiteral(R"((//[^\n]*|/\*|\*/|\#[^\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\b(?:const|let|var|return|if|else|for|while|function|async|await|class|import|from|def|in|True|False|None|true|false|null|new|throw|try|catch)\b|\b\d+(?:\.\d+)?\b))"));
    bool blockComment = previousBlockState() == 1;
    int start = 0;
    auto matches = tokens.globalMatch(text);
    while (matches.hasNext()) {
        const auto match = matches.next();
        const auto token = match.captured();
        if (blockComment) {
            if (token == "*/") { setFormat(start, match.capturedEnd() - start, comment_); blockComment = false; }
            continue;
        }
        if (token == "/*") { start = match.capturedStart(); blockComment = true; continue; }
        const auto first = token.front();
        setFormat(match.capturedStart(), match.capturedLength(), token.startsWith("//") || first == '#' ? comment_ : first == '\'' || first == '"' || first == '`' || first.isDigit() ? literal_ : keyword_);
    }
    if (blockComment) { setFormat(start, text.size() - start, comment_); }
    setCurrentBlockState(blockComment ? 1 : 0);
}
}
void nodetool::node_editor::registerCodeHighlighter() {
    static const auto registration = qmlRegisterType<CodeHighlighter>("NodeTool.Code", 1, 0, "CodeHighlighter");
    Q_UNUSED(registration)
}
