#pragma once
#include <QObject>
#include <QStringList>
#include <QVariantList>

#include "graph/CatalogSearch.h"

namespace nodetool::node_editor {

// What the node library (Catalog.qml) and the floating node menu
// (NodeMenu.qml) read and do: the listed nodes, ranking, recent and favorite
// types, quick-action tiles, and the add, drag, favorite and menu actions.
//
// The owner fills the state with the setters and handles the *Requested
// signals. EditorWindow holds one by value for its panels. A test can use a
// plain instance with fixture data and a QSignalSpy on the signals. QML gets a
// non-owning pointer through a required property.
//
// UI thread only.
class NodeCatalog : public QObject {
    Q_OBJECT
    // One map per listed node: type, label, namespace, categories, description,
    // deprecated, inputTypes, outputTypes, provider, providerName, keyGate, icon, color.
    Q_PROPERTY(QVariantList nodes READ nodes NOTIFY nodesChanged)
    // The library category ids, labels and namespaces (src/graph/CatalogCategories.h).
    Q_PROPERTY(QVariantList categories READ categories CONSTANT)
    // Recently added node types, most recent first (web stores/RecentNodesStore.ts).
    Q_PROPERTY(QStringList recent READ recent NOTIFY recentChanged)
    // Favorite node types, newest first (web stores/FavoriteNodesStore.ts).
    Q_PROPERTY(QStringList favorites READ favorites NOTIFY favoritesChanged)
    // The node menu home's quick-action sections, each a title and tiles.
    Q_PROPERTY(QVariantList quickActions READ quickActions CONSTANT)
    // A read-only document takes no new nodes.
    Q_PROPERTY(bool readOnly READ readOnly NOTIFY readOnlyChanged)
public:
    explicit NodeCatalog(QObject *parent = nullptr);
    ~NodeCatalog() override;

    QVariantList nodes() const { return nodes_; }
    QVariantList categories() const;
    QStringList recent() const { return recent_; }
    QStringList favorites() const { return favorites_; }
    QVariantList quickActions() const;
    bool readOnly() const { return readOnly_; }

    void setNodes(const QVariantList &nodes);
    void setRecent(const QStringList &recent);
    void setFavorites(const QStringList &favorites);
    void setReadOnly(bool readOnly);

    // Indexes into `nodes` in the web search order for a query, with recent
    // types boosted (src/graph/CatalogSearch.h).
    Q_INVOKABLE QVariantList rank(const QVariantList &nodes, const QString &query) const;
    Q_INVOKABLE void add(const QString &type) { emit addRequested(type); }
    Q_INVOKABLE void drag(const QString &type) { emit dragRequested(type); }
    Q_INVOKABLE void toggleFavorite(const QString &type) { emit toggleFavoriteRequested(type); }
    Q_INVOKABLE void clearFavorites() { emit clearFavoritesRequested(); }
    Q_INVOKABLE void clearRecent() { emit clearRecentRequested(); }
    Q_INVOKABLE void closeMenu() { emit closeMenuRequested(); }
    // The node menu header drag, in scene pixels.
    Q_INVOKABLE void moveMenu(qreal dx, qreal dy) { emit moveMenuRequested(dx, dy); }

signals:
    void nodesChanged();
    void recentChanged();
    void favoritesChanged();
    void readOnlyChanged();
    void addRequested(const QString &type);
    void dragRequested(const QString &type);
    void toggleFavoriteRequested(const QString &type);
    void clearFavoritesRequested();
    void clearRecentRequested();
    void closeMenuRequested();
    void moveMenuRequested(qreal dx, qreal dy);

private:
    QVariantList nodes_;
    QStringList recent_;
    QStringList favorites_;
    bool readOnly_ = false;
    // rank is const for QML, so its caches are mutable.
    mutable CatalogRanker ranker_;
};

}  // namespace nodetool::node_editor
