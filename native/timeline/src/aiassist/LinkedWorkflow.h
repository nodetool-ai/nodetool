#pragma once
#include <QJsonObject>
namespace nt::aiassist {
// Script response contains id and document:{cast,sections}. Unrelated fields survive.
QJsonObject reconcileScript(QJsonObject timeline, const QJsonObject& script);
// Only unlocked shot-source video/audio edit units change. Duration and active take
// follow shotLink.ts, preserving or fitting the existing source window.
QJsonObject syncStoryboardShot(QJsonObject timeline, const QJsonObject& payload);
}
