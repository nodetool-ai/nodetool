#pragma once
#include <QString>
#include <QColor>
#include <QTextDocument>
#include <QVariantList>
namespace nt::chat {
void styleMarkdownLinks(QTextDocument &document, const QColor &colour);
QString cleanHarmony(const QString &source);
QVariantList markdownPages(const QString &source);
}
