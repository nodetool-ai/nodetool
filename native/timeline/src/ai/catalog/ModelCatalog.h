#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QVariantList>
#include <QVariantMap>

namespace nt::ai {
QString catalogCapability(const QString& mode);
QString catalogProcedure(const QString& mode);
bool catalogProviderMatches(const QString& mode, const QJsonArray& capabilities);
QVariantList catalogModels(const QJsonArray& models, const QString& provider, const QString& mode);
QVariantMap catalogConstraints(const QVariantMap& model);
}

namespace nt::ai {
// Entity markers use the owning asset id as their persistent identity even
// when their reference picture is replaced.
QVariantList catalogEntities(const QJsonArray& assets);
}
