#pragma once
#include <QString>
#include <QColor>
#include <QTextDocument>
#include <QVariantList>
namespace nt::chat {
void styleMarkdownLinks(QTextDocument &document, const QColor &colour);
// ChatThreadView.styles.ts: a reply reads at 165% line height, with `blockGap`
// after each paragraph, list and quote, `itemGap` between list items and
// `headingGap` above a heading. The last block keeps no space after it.
// Sets only what differs, so calling it again changes nothing.
void styleReadingRhythm(QTextDocument &document, qreal blockGap, qreal itemGap, qreal headingGap);
QString cleanHarmony(const QString &source);
QVariantList markdownPages(const QString &source);
}
