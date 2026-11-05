#pragma once
#include <QString>
#include <QVariantList>
namespace nt::chat {
QString cleanHarmony(const QString &source);
QVariantList markdownPages(const QString &source);
}
