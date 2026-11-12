#pragma once
#include <QList>
#include <QString>
#include <QStringList>
#include <memory>

namespace nodetool {
// The fields of a node that the web catalog search reads.
struct CatalogSearchNode {
    QString type;
    QString title;
    QString nameSpace;
    // The raw metadata description: the text, a tag line and a "Use cases:" section.
    QString description;
    bool deprecated = false;
    bool operator==(const CatalogSearchNode &other) const = default;
};

// The node types the web menu favors, in web order.
// Source: web/src/config/quickActionNodeTypes.ts.
const QStringList &catalogQuickActionTypes();

// Ranks nodes for a query, best first, and returns indexes into `nodes`. An
// empty query ranks with the recent and quick-action boosts alone. `recent`
// lists node types most recent first.
// Source: web/src/utils/nodeSearch.ts rankSearchNodes. It merges prefix-tree
// boosts (utils/PrefixTreeSearch.ts), BM25 boosts (utils/bm25.ts) and, below
// 100 results, fuzzy boosts (utils/fuzzyMatch.ts) into the field scores of
// utils/nodeRanking.ts and utils/ranking.ts.
QList<int> rankCatalogNodes(const QList<CatalogSearchNode> &nodes, const QString &query, const QStringList &recent,
                            const QStringList &boosted = catalogQuickActionTypes());

// rankCatalogNodes with caches that persist between calls: the boost index of
// the last node set and the lowercased fields of each node type. UI thread only.
class CatalogRanker {
public:
    CatalogRanker();
    ~CatalogRanker();
    CatalogRanker(const CatalogRanker &) = delete;
    CatalogRanker &operator=(const CatalogRanker &) = delete;
    QList<int> rank(const QList<CatalogSearchNode> &nodes, const QString &query, const QStringList &recent,
                    const QStringList &boosted = catalogQuickActionTypes());

private:
    struct State;
    std::unique_ptr<State> state_;
};

// The fuzzy scorer of web/src/utils/fuzzyMatch.ts, in [0, 1].
double catalogFuzzyScore(const QString &query, const QString &text);
} // namespace nodetool
