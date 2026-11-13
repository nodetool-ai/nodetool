#include "Mounts.h"

#include "interfaces/NodeCatalog.h"
#include "server/PackSetup.h"

#include <QJsonArray>
#include <QQuickItem>
#include <functional>
#include <map>

namespace nodetool::parity {
namespace {

using node_editor::NodeCatalog;
using node_editor::PackSetup;

QStringList strings(const QJsonValue &value) {
    QStringList list;
    for (const auto &entry : value.toArray()) {
        list.append(entry.toString());
    }
    return list;
}

// NodeMenu.qml, the floating node menu. Fixture keys: `metadata` (the node
// metadata array), `recent` and `favorites` (node types).
class NodeMenuMount final : public Mount {
public:
    explicit NodeMenuMount(const QJsonObject &fixture) {
        catalog_.setNodes(NodeCatalog::entriesFromMetadata(fixture["metadata"].toArray()));
        catalog_.setRecent(strings(fixture["recent"]));
        catalog_.setFavorites(strings(fixture["favorites"]));
        // EditorWindow sets the window height that caps the packs popup.
        catalog_.setWindowHeight(size().height());
    }
    QUrl source() const override { return QUrl("qrc:/qt/qml/NodeTool/NodeEditor/NodeMenu.qml"); }
    QVariantMap initialProperties() override {
        return {{"catalog", QVariant::fromValue(&catalog_)}, {"packSetup", QVariant::fromValue(&packSetup_)}};
    }
    std::vector<QObject *> interfaces() override { return {&catalog_, &packSetup_}; }
    // EditorWindow::openNodeMenu: 980 by 620 in a large window.
    QSize size() const override { return {980, 620}; }
    void opened(QQuickItem &root) override {
        QMetaObject::invokeMethod(&root, "reset");
        QMetaObject::invokeMethod(&root, "focusSearch");
    }
    QJsonObject probe(QQuickItem &root) const override {
        QJsonArray results;
        const auto visible = root.property("visibleNodes").toList();
        for (const auto &node : visible) {
            results.append(node.toMap().value("type").toString());
        }
        const int highlighted = root.property("highlighted").toInt();
        return {{"query", root.property("query").toString()},
                {"home", root.property("homeLayout").toBool()},
                {"results", results},
                {"highlighted", highlighted >= 0 && highlighted < visible.size()
                                    ? QJsonValue(visible[highlighted].toMap().value("type").toString())
                                    : QJsonValue()}};
    }

private:
    NodeCatalog catalog_;
    PackSetup packSetup_;
};

using Factory = std::function<std::unique_ptr<Mount>(const QJsonObject &)>;

const std::map<QString, Factory> &factories() {
    static const std::map<QString, Factory> table{
        {"NodeMenu", [](const QJsonObject &fixture) { return std::make_unique<NodeMenuMount>(fixture); }},
    };
    return table;
}

}  // namespace

std::unique_ptr<Mount> makeMount(const QString &component, const QJsonObject &fixture, QString &error) {
    const auto &table = factories();
    const auto found = table.find(component);
    if (found == table.end()) {
        error = QString("No mount for component %1. Known: %2").arg(component, mountNames().join(", "));
        return nullptr;
    }
    if (!fixture["metadata"].isArray()) {
        error = "The fixture has no metadata array";
        return nullptr;
    }
    return found->second(fixture);
}

QStringList mountNames() {
    QStringList names;
    for (const auto &[name, factory] : factories()) {
        names.append(name);
    }
    return names;
}

}  // namespace nodetool::parity
