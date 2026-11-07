#pragma once
#include <QDateTime>
#include <QJsonObject>
#include <QStringList>
#include <QVariantList>
#include <QVariantMap>

// Composer rules ported from the web chat composer. Each function names its
// web source in ComposerRules.cpp.
namespace nt::chat::composer {
QVariantList mediaModes();
bool isMediaMode(const QString &mode);
QVariantMap defaultSettings(const QString &mode);
QString catalogMode(const QString &mode);
QStringList catalogTasks(const QString &mode);
// Options for one setting chip, narrowed by the picked model's constraints.
QVariantList settingOptions(const QString &mode, const QString &key, const QVariantMap &constraints);
// The chips ModeChips.tsx shows for a mode, in its order, as
// {key, label, header, iconName, value, options}.
QVariantList settingChips(const QString &mode, const QVariantMap &settings, const QVariantMap &constraints);
// The model chip label before a model is picked.
QString modelPlaceholder(const QString &mode);
// Snaps settings the picked model cannot take to its first allowed value.
QVariantMap clampSettings(const QString &mode, QVariantMap settings, const QVariantMap &constraints);
QJsonObject mediaRequest(const QString &mode, const QVariantMap &settings, const QString &provider,
                         const QString &model);
QString pickModelMessage(const QString &mode);
QVariantList reasoningLevels();
bool supportsReasoningEffort(const QString &provider, const QString &model);
QString assetUri(const QString &id, const QString &name, const QString &contentType);
QJsonObject assetContent(const QString &id, const QString &name, const QString &contentType);
// The @-mention being typed at caret, as {start, end, query}, or an empty map.
QVariantMap mentionTrigger(const QString &text, int caret);
// The text with the @query cut out, as {text, caret}.
QVariantMap removeMention(const QString &text, int start, int end);
QString dateGroup(const QDateTime &updated, const QDateTime &now);
QString groupDate(const QDateTime &updated);
} // namespace nt::chat::composer
