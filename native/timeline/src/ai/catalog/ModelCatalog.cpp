#include "ai/catalog/ModelCatalog.h"
#include "../../../../model-picker/src/CatalogRules.h"

namespace nt::ai {
QString catalogCapability(const QString& mode) { return nt::modelpicker::detail::catalogCapability(mode); }
QString catalogProcedure(const QString& mode) { return nt::modelpicker::detail::catalogProcedure(mode); }
bool catalogProviderMatches(const QString& mode, const QJsonArray& capabilities) { return nt::modelpicker::detail::catalogProviderMatches(mode, capabilities); }
QVariantList catalogModels(const QJsonArray& models, const QString& provider, const QString& mode) { return nt::modelpicker::detail::catalogModels(models, provider, mode); }
QVariantMap catalogConstraints(const QVariantMap& model) { return nt::modelpicker::detail::catalogConstraints(model); }
}

namespace nt::ai {
QVariantList catalogEntities(const QJsonArray& assets) {
    QVariantList result;
    for (const auto& value : assets) {
        const auto asset = value.toObject();
        const auto marker = asset.value("metadata").toObject().value("nodetool_entity").toObject();
        const auto kind = marker.value("kind").toString();
        if (kind != "character" && kind != "location" && kind != "style" && kind != "prop") continue;
        const auto id = asset.value("id").toString();
        if (id.isEmpty()) continue;
        auto entity = marker.toVariantMap();
        entity.insert("id", id);
        entity.insert("name", marker.value("name").toString());
        entity.insert("descriptor", marker.value("descriptor").toString());
        const auto reference = marker.value("reference_asset_id").toString().trimmed();
        entity.insert("referenceAssetId", reference.isEmpty() ? id : reference);
        result.append(entity);
    }
    return result;
}
}
