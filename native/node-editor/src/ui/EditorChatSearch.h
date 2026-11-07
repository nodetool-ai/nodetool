#pragma once
#include <QJsonArray>
#include <QString>

namespace nodetool {
// Ranks node metadata as web computeSearchResults does for ui_search_nodes:
// no selected path, every provider kind and no recent node types. See
// web/src/utils/nodeSearch.ts. Entries keep their metadata JSON.
QJsonArray computeNodeSearchResults(const QJsonArray &metadata, const QString &term,
                                    const QString &inputType, const QString &outputType,
                                    bool strictMatch);
} // namespace nodetool
