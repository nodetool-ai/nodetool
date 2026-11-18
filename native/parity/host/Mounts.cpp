#include "Mounts.h"

#include "ComposerSession.h"
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

// ChatComposer.qml of NodeTool.Chat, as the editor's chat window holds it.
// The fixture needs no fields: the session starts empty and idle.
class ChatComposerMount final : public Mount {
public:
    QUrl source() const override { return QUrl("qrc:/qt/qml/NodeTool/Chat/ChatComposer.qml"); }
    QVariantMap initialProperties() override { return {{"session", QVariant::fromValue(&session_)}}; }
    std::vector<QObject *> interfaces() override { return {&session_}; }
    // The composer inside the chat window's default 420 pixel width.
    QSize size() const override { return {400, 160}; }
    void opened(QQuickItem &root) override { QMetaObject::invokeMethod(&root, "focusEditor"); }
    QJsonObject probe(QQuickItem &root) const override {
        const auto *input = root.findChild<QQuickItem *>("chatInput");
        return {{"draft", input ? input->property("text").toString() : QString()},
                {"running", session_.turnStatus() != "idle"},
                {"compact", root.property("compact").toBool()},
                {"permission", session_.permissionMode()}};
    }

private:
    ComposerSession session_;
};

using Factory = std::function<std::unique_ptr<Mount>(const QJsonObject &, QString &)>;

const std::map<QString, Factory> &factories() {
    static const std::map<QString, Factory> table{
        {"NodeMenu", [](const QJsonObject &fixture, QString &error) -> std::unique_ptr<Mount> {
             if (!fixture["metadata"].isArray()) {
                 error = "The fixture has no metadata array";
                 return nullptr;
             }
             return std::make_unique<NodeMenuMount>(fixture);
         }},
        {"ChatComposer", [](const QJsonObject &, QString &) -> std::unique_ptr<Mount> {
             return std::make_unique<ChatComposerMount>();
         }},
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
    return found->second(fixture, error);
}

QStringList mountNames() {
    QStringList names;
    for (const auto &[name, factory] : factories()) {
        names.append(name);
    }
    return names;
}

}  // namespace nodetool::parity
