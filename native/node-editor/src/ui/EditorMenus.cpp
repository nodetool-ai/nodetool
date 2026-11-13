#include "EditorWindow.h"
#include "document/ChildPorts.h"
#include "graph/EditorScene.h"
#include "graph/CanvasMediaPresenter.h"
#include <QApplication>
#include <QUuid>
#include <QMouseEvent>
#include <QLocale>
#include <QKeySequence>
#include <QClipboard>
#include <QJsonDocument>
#include <QMenu>
#include <QDialog>
#include <QVBoxLayout>
#include <QQuickWidget>
#include <QQuickItem>
#include <QQmlEngine>
#include <QScrollBar>
#include <QTimer>
#include <QVariantAnimation>
#include <QSignalBlocker>
#include <QGraphicsView>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <functional>
#include <memory>
#include <optional>
namespace nodetool {
class MenuDispatch final : public QObject {
 Q_OBJECT
public:
 using QObject::QObject;
 std::function<void(QString)> invoke;
 Q_INVOKABLE void choose(const QString &name) { if (invoke) { invoke(name); } }
};

// The web FindInWorkflowDialog state: a debounced search, a result index and
// the activation of one result. The host supplies the document-specific parts.
class FindController final : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList results READ results NOTIFY changed)
    Q_PROPERTY(int selectedIndex READ selectedIndex NOTIFY changed)
    Q_PROPERTY(QString status READ status NOTIFY changed)
    Q_PROPERTY(QString term READ term NOTIFY changed)
public:
    explicit FindController(QObject *parent) : QObject(parent) {
        timer_.setSingleShot(true);
        timer_.setInterval(150);
        connect(&timer_, &QTimer::timeout, this, &FindController::flush);
    }
    std::function<QVariantList(const QString &)> search;
    std::function<void(const QString &)> reveal;
    std::function<void()> dismiss;
    QVariantList results() const { return results_; }
    int selectedIndex() const { return selectedIndex_; }
    QString term() const { return term_; }
    QString status() const {
        if (!results_.isEmpty()) {
            return tr("%1 of %2 node found").arg(selectedIndex_ + 1).arg(results_.size());
        }
        return term_.trimmed().isEmpty() ? tr("Type to search nodes") : tr("No nodes found");
    }
    Q_INVOKABLE void setTerm(const QString &term) {
        term_ = term;
        pending_ = true;
        timer_.start();
        emit changed();
    }
    // Runs the search now, so Enter acts on the text in the field.
    Q_INVOKABLE void flush() {
        timer_.stop();
        pending_ = false;
        results_ = term_.trimmed().isEmpty() || !search ? QVariantList{} : search(term_);
        selectedIndex_ = 0;
        emit changed();
    }
    Q_INVOKABLE void activate(int index) {
        if (index < 0 || index >= results_.size()) {
            return;
        }
        selectedIndex_ = index;
        emit changed();
        if (reveal) {
            reveal(results_.at(index).toMap().value("id").toString());
        }
    }
    Q_INVOKABLE void next() { step(1); }
    Q_INVOKABLE void previous() { step(-1); }
    Q_INVOKABLE void choose(int index) {
        activate(index);
        close();
    }
    // Enter: go to the selected result, or to the first of a search that had not run yet.
    Q_INVOKABLE void accept() {
        if (pending_) {
            flush();
            activate(0);
        } else {
            activate(selectedIndex_);
        }
        close();
    }
    Q_INVOKABLE void close() {
        if (dismiss) {
            dismiss();
        }
    }
signals:
    void changed();
private:
    void step(int delta) {
        if (results_.isEmpty()) {
            return;
        }
        activate((selectedIndex_ + delta + results_.size()) % results_.size());
    }
    QTimer timer_;
    QString term_;
    QVariantList results_;
    int selectedIndex_ = 0;
    bool pending_ = false;
};

// Closes the find panel on a press outside it, and keeps it at the window's
// top right as the window resizes.
class FindPanelFilter final : public QObject {
    Q_OBJECT
public:
    FindPanelFilter(QQuickWidget *panel, QWidget *window, std::function<void()> dismiss)
        : QObject(panel), panel_(panel), window_(window), dismiss_(std::move(dismiss)) {
        window_->installEventFilter(this);
        QTimer::singleShot(100, this, [this] {
            armed_ = true;
            qApp->installEventFilter(this);
        });
    }
    ~FindPanelFilter() override {
        qApp->removeEventFilter(this);
        if (window_) {
            window_->removeEventFilter(this);
        }
    }
protected:
    bool eventFilter(QObject *object, QEvent *event) override {
        if (object == window_ && event->type() == QEvent::Resize && panel_) {
            panel_->move(window_->width() - panel_->width() - 20, 60);
        } else if (armed_ && event->type() == QEvent::MouseButtonPress && panel_) {
            const auto *mouse = static_cast<QMouseEvent *>(event);
            if (!panel_->rect().contains(panel_->mapFromGlobal(mouse->globalPosition().toPoint()))) {
                dismiss_();
            }
        }
        return false;
    }
private:
    QPointer<QQuickWidget> panel_;
    QPointer<QWidget> window_;
    std::function<void()> dismiss_;
    bool armed_ = false;
};

namespace {
struct Shortcut { const char *command; const char *keys; };
const Shortcut shortcuts[] = {
 {"Align", "A"}, {"Align with spacing", "Shift+A"}, {"Move left", "Left"}, {"Move right", "Right"}, {"Move up", "Up"}, {"Move down", "Down"}, {"Cancel gesture", "Esc"}, {"Copy", "Ctrl+C"}, {"Cut", "Ctrl+X"}, {"Paste", "Ctrl+V"},
 {"Undo", "Ctrl+Z"}, {"Redo", "Ctrl+Shift+Z"}, {"Redo", "Ctrl+Y"},
 {"Duplicate vertical", "Ctrl+Shift+D"}, {"Select all", "Ctrl+A"}, {"Duplicate", "Ctrl+D"}, {"Delete", "Delete"}, {"Delete", "Backspace"},
 {"Fit", "F"}, {"Group selection", "Ctrl+G"}, {"Add node", "Space"},
 {"Disable toggle", "B"}, {"Toggle collapse", "C"}, {"Toggle inspector", "I"}, {"Workflows", "1"},
 {"Reset zoom", "Ctrl+0"}, {"Zoom in", "Ctrl+="}, {"Zoom out", "Ctrl+-"},
 {"Zoom to 50%", "Ctrl+Alt+5"}, {"Zoom to 100%", "Ctrl+Alt+1"}, {"Zoom to 200%", "Ctrl+Alt+2"}, {"Save", "Ctrl+S"}, {"Open", "Ctrl+O"}, {"Find node", "Ctrl+F"},
 {"Run", "Ctrl+Return"}, {"Command menu", "Ctrl+K"}, {"Keyboard shortcuts", "Ctrl+/"}, {"Keyboard shortcuts", "Shift+?"},
 {"Align left", "Shift+Left"}, {"Align right", "Shift+Right"},
 {"Align top", "Shift+Up"}, {"Align bottom", "Shift+Down"},
 {"Align center", "Shift+H"}, {"Align middle", "Shift+E"},
 {"Distribute horizontally", "Shift+D"}, {"Stack selection", "V"}, {"Arrange grid", "G"},
 {"Select all connected", "Shift+C"}, {"Select inputs", "Shift+I"}, {"Select outputs", "Shift+O"},
 {"Add Prompt", "Shift+P"}, {"Add Text to Image", "Shift+G"}, {"Add Text to Video", "Shift+V"}, {"Add Agent", "Shift+L"}
};

// The web shortcut category (config/shortcuts.ts) of each native command.
QString helpCategory(const QString &command) {
    if (command == "Run" || command == "Save" || command == "Open") { return "workflow"; }
    if (command == "Add node" || command == "Toggle inspector" || command == "Workflows") { return "panel"; }
    return "editor";
}

// "Ctrl+Shift+Z" as the web key names the on-screen keyboard uses.
QStringList webKeys(const QString &sequence) {
    static const QHash<QString, QString> names{
        {"Ctrl", "Control"}, {"Left", "ArrowLeft"}, {"Right", "ArrowRight"}, {"Up", "ArrowUp"}, {"Down", "ArrowDown"},
        {"Esc", "Escape"}, {"Return", "Enter"}, {"Space", " "}, {"Del", "Delete"}};
    QStringList keys;
    const auto portable = QKeySequence(sequence).toString(QKeySequence::PortableText);
    for (const auto &part : portable.split('+', Qt::SkipEmptyParts)) {
        keys.append(names.value(part, part));
    }
    return keys;
}

struct RowOptions {
    QString shortcut;
    QString tooltip;
    QString reason;
    bool enabled = true;
    bool destructive = false;
};

// Entries for ContextMenuPanel.qml plus the action each id runs.
class MenuBuilder {
public:
    void item(const QString &id, const QString &label, const QString &icon, std::function<void()> run, const RowOptions &options = {}) {
        QVariantMap entry{{"id", id}, {"label", label}, {"icon", icon}, {"enabled", options.enabled}, {"destructive", options.destructive}};
        if (!options.shortcut.isEmpty()) { entry.insert("shortcut", options.shortcut); }
        if (!options.tooltip.isEmpty()) { entry.insert("tooltip", options.tooltip); }
        if (!options.reason.isEmpty() && !options.enabled) { entry.insert("reason", options.reason); }
        entries_.append(entry);
        actions_.insert(id, std::move(run));
    }
    void submenu(const QString &id, const QString &label, const QString &icon, const MenuBuilder &children, const RowOptions &options = {}) {
        QVariantMap entry{{"id", id}, {"label", label}, {"icon", icon}, {"enabled", options.enabled && !children.entries_.isEmpty()}, {"submenu", children.entries_}};
        if (!options.reason.isEmpty() && !entry.value("enabled").toBool()) { entry.insert("reason", options.reason); }
        entries_.append(entry);
        for (auto it = children.actions_.cbegin(); it != children.actions_.cend(); ++it) {
            actions_.insert(it.key(), it.value());
        }
    }
    void separator() {
        if (entries_.isEmpty() || entries_.last().toMap().contains("separator")) {
            return;
        }
        entries_.append(QVariantMap{{"separator", true}});
    }
    void header(const QString &label) {
        entries_.append(QVariantMap{{"header", label}});
    }
    QVariantList entries() const {
        auto result = entries_;
        while (!result.isEmpty() && result.last().toMap().contains("separator")) {
            result.removeLast();
        }
        return result;
    }
    const QHash<QString, std::function<void()>> &actions() const { return actions_; }
private:
    QVariantList entries_;
    QHash<QString, std::function<void()>> actions_;
};

QString hint(const char *sequence) {
    return QKeySequence(QString::fromLatin1(sequence)).toString(QKeySequence::NativeText);
}
}

// Builds the context menus of the web components/context_menus owners.
class ContextMenuBuilder {
public:
    ContextMenuBuilder(EditorWindow &window, const QString &nodeId, const QString &edgeId, const QPointF &scene, const QPoint &global)
        : w(window), nodeId_(nodeId), edgeId_(edgeId), scene_(scene), global_(global) {}

    // PaneContextMenu.tsx
    MenuBuilder pane() {
        MenuBuilder menu;
        const bool editable = !w.readOnly();
        const bool clipboard = QJsonDocument::fromJson(QApplication::clipboard()->text().toUtf8()).isObject();
        const auto locked = [&](bool extra = true) { return RowOptions{.reason = w.readOnlyReason(), .enabled = editable && extra}; };
        menu.item("paste", tr("Paste"), "southEast", [this] {
            w.pasteMenuPosition_ = global_;
            w.action("Paste");
        }, {.shortcut = hint("Ctrl+V"), .reason = editable ? tr("No valid node data in clipboard") : w.readOnlyReason(), .enabled = editable && clipboard});
        menu.item("fit", tr("Fit screen"), "fitScreen", [this] { w.userAction("Fit"); }, {.shortcut = hint("F")});
        menu.separator();
        const auto group = [&](const QVariantList &options, const QString &prefix) {
            MenuBuilder children;
            for (const auto &option : options) {
                const auto pair = option.toStringList();
                if (!w.knownNodeType(pair.at(1))) { continue; }
                children.item(prefix + pair.at(1), pair.at(0), "", [this, type = pair.at(1)] { w.addNodeAt(type, scene_); }, locked());
            }
            return children;
        };
        const QVariantList constants{QStringList{"Audio", "nodetool.constant.Audio"}, QStringList{"Bool", "nodetool.constant.Bool"}, QStringList{"Data Frame", "nodetool.constant.DataFrame"},
            QStringList{"Date", "nodetool.constant.Date"}, QStringList{"Date Time", "nodetool.constant.DateTime"}, QStringList{"Dict", "nodetool.constant.Dict"},
            QStringList{"Document", "nodetool.constant.Document"}, QStringList{"Float", "nodetool.constant.Float"}, QStringList{"Image", "nodetool.constant.Image"},
            QStringList{"Integer", "nodetool.constant.Integer"}, QStringList{"JSON", "nodetool.constant.JSON"}, QStringList{"List", "nodetool.constant.List"},
            QStringList{"Model 3D", "nodetool.constant.Model3D"}, QStringList{"Select", "nodetool.constant.Select"}, QStringList{"String", "nodetool.constant.String"},
            QStringList{"Video", "nodetool.constant.Video"}};
        const QVariantList inputs{QStringList{"Audio", "nodetool.input.AudioInput"}, QStringList{"Boolean", "nodetool.input.BooleanInput"}, QStringList{"Data Frame", "nodetool.input.DataframeInput"},
            QStringList{"Document", "nodetool.input.DocumentInput"}, QStringList{"Float", "nodetool.input.FloatInput"}, QStringList{"Image", "nodetool.input.ImageInput"},
            QStringList{"Integer", "nodetool.input.IntegerInput"}, QStringList{"Select", "nodetool.input.SelectInput"}, QStringList{"String", "nodetool.input.StringInput"},
            QStringList{"Video", "nodetool.input.VideoInput"}};
        menu.submenu("add-constant", tr("Add constant node"), "dataObject", group(constants, "add-constant:"), {.reason = tr("No constant nodes in the catalog")});
        menu.submenu("add-input", tr("Add input node"), "input", group(inputs, "add-input:"), {.reason = tr("No input nodes in the catalog")});
        menu.separator();
        menu.item("add-comment", tr("Add comment"), "addComment", [this] {
            const auto id = QUuid::createUuid().toString(QUuid::Id128);
            const QJsonObject position{{"x", scene_.x()}, {"y", scene_.y()}};
            w.apply({{"op", "addNode"}, {"node", QJsonObject{{"id", id}, {"type", "nodetool.workflows.base_node.Comment"}, {"data", QJsonObject{{"comment", "Comment"}}},
                {"ui_properties", QJsonObject{{"position", position}, {"width", 300}, {"height", 160}}}}}});
        }, {.tooltip = tr("Hold C key and drag"), .reason = w.readOnlyReason(), .enabled = editable});
        menu.item("add-group", tr("Add group"), "groupWork", [this] {
            const auto id = QUuid::createUuid().toString(QUuid::Id128);
            const QJsonObject position{{"x", scene_.x()}, {"y", scene_.y()}};
            w.apply({{"op", "addNode"}, {"node", QJsonObject{{"id", id}, {"type", "nodetool.workflows.base_node.Group"}, {"data", QJsonObject{{"headline", "Group"}}},
                {"ui_properties", QJsonObject{{"title", "Group"}, {"position", position}, {"width", 300}, {"height", 200}}}}}});
        }, {.tooltip = tr("Add a group node"), .reason = w.readOnlyReason(), .enabled = editable});
        const auto typed = [&](const QString &id, const QString &label, const QString &icon, const QString &type, const QString &tip) {
            const bool known = w.knownNodeType(type);
            menu.item(id, label, icon, [this, type] { w.addNodeAt(type, scene_); },
                {.tooltip = tip, .reason = editable ? tr("Not in the node catalog") : w.readOnlyReason(), .enabled = editable && known});
        };
        typed("add-workflow", tr("Add workflow"), "accountTree", "nodetool.workflows.workflow_node.Workflow", tr("Add a workflow node"));
        typed("add-subgraph", tr("Add subgraph"), "schema", "nodetool.workflows.subgraph.Subgraph", tr("Add an inline subgraph node"));
        typed("add-app", tr("Add app"), "apps", "nodetool.workflows.app_node.App", tr("Run a mini app as a node"));
        return menu;
    }

    // NodeContextMenu.tsx
    MenuBuilder node() {
        MenuBuilder menu;
        const auto node = w.document_.node(nodeId_);
        const auto type = node["type"].toString();
        const auto ui = node["ui_properties"].toObject();
        const bool editable = !w.readOnly();
        const bool bypassed = ui["bypassed"].toBool();
        const bool collapsed = ui["collapsed"].toBool() || node["data"].toObject()["collapsed"].toBool();
        const bool commented = !ui["title"].toString().trimmed().isEmpty();
        const bool inGroup = !node["parent_id"].toString().isEmpty();
        const auto locked = w.readOnlyReason();
        menu.item("chat-about-node", tr("Chat about node"), "forumOutlined", [this] { chatAbout(); }, {.tooltip = tr("Open the chat with this node in the prompt")});
        if (w.canvasMedia_ && w.canvasMedia_->canViewImage(nodeId_)) {
            menu.item("open-image-viewer", tr("Open image viewer"), "fitScreen", [this] {
                if (w.canvasMedia_) { w.canvasMedia_->viewImage(nodeId_); }
            });
        }
        // Web OutputQuickActionButtons / config/outputQuickActions.ts: one-step follow-ups on an image output.
        if (w.canvasMedia_) {
            const auto imageOutput = w.canvasMedia_->imageOutputName(nodeId_);
            struct QuickAction { const char *id; const char *type; const char *icon; QString label; };
            const QuickAction quickActions[] = {
                {"quick-action-upscale", "nodetool.image.Upscale", "aspectRatio", tr("Upscale")},
                {"quick-action-remove-background", "nodetool.image.RemoveBackground", "layers", tr("Remove background")},
                {"quick-action-edit", "nodetool.image.ImageToImage", "autoFixHigh", tr("Edit with prompt")}};
            for (const auto &action : quickActions) {
                if (imageOutput.isEmpty() || !w.knownNodeType(action.type)) { continue; }
                menu.item(action.id, action.label, action.icon,
                    [this, imageOutput, type = QString::fromLatin1(action.type)] { w.addConnectedNode(nodeId_, imageOutput, type, "image"); },
                    {.tooltip = tr("Add a connected node for this image"), .reason = w.readOnlyReason(), .enabled = editable});
            }
        }
        menu.separator();
        if (inGroup) {
            menu.item("remove-from-group", tr("Remove from group"), "groupRemove", [this] { w.action("Remove from group"); },
                {.tooltip = tr("Remove this node from the group"), .reason = locked, .enabled = editable});
        }
        menu.item("copy", tr("Copy"), "copy", [this] { w.action("Copy"); }, {.shortcut = hint("Ctrl+C")});
        menu.item("cut", tr("Cut"), "contentCut", [this] { w.action("Cut"); }, {.shortcut = hint("Ctrl+X"), .reason = locked, .enabled = editable});
        menu.item("copy-json", tr("Copy node as JSON"), "dataArray", [this] {
            QApplication::clipboard()->setText(QString::fromUtf8(QJsonDocument(w.document_.node(nodeId_)).toJson(QJsonDocument::Indented)));
        }, {.tooltip = tr("Copy node data as JSON")});
        menu.item("duplicate", tr("Duplicate"), "queue", [this] { w.action("Duplicate"); }, {.shortcut = hint("Ctrl+D"), .reason = locked, .enabled = editable});
        menu.item("duplicate-vertical", tr("Duplicate vertically"), "south", [this] { w.action("Duplicate vertical"); },
            {.shortcut = hint("Ctrl+Shift+D"), .reason = locked, .enabled = editable});
        const bool connected = w.session_.connected();
        // useRunFromHere.ts reports isWorkflowRunning: false, so this entry never waits for another run.
        menu.item("run-node", tr("Run node"), "playArrow", [this] { w.action("Run selected"); },
            {.tooltip = tr("Run this node as its own job, using previous results as inputs"),
             .reason = !editable ? locked : tr("Connect to a server to run nodes"), .enabled = editable && connected});
        menu.item("toggle-bypass", bypassed ? tr("Enable node") : tr("Disable node"), bypassed ? "power" : "block",
            [this, bypassed] { w.action(bypassed ? "Enable selected" : "Disable selected"); }, {.shortcut = hint("B"), .reason = locked, .enabled = editable});
        menu.item("toggle-collapsed", collapsed ? tr("Expand node") : tr("Collapse node"), collapsed ? "unfoldMore" : "unfoldLess", [this] { w.action("Toggle collapse"); },
            {.shortcut = hint("C"), .reason = !editable ? locked : tr("Groups and comments have no collapsed state"), .enabled = editable && w.menuActionEnabled("Toggle collapse")});
        const bool noteable = type != "nodetool.workflows.base_node.Group" && type != "nodetool.workflows.base_node.Comment" && type != "nodetool.code.Code";
        menu.item("toggle-comment", commented ? tr("Delete comment") : tr("Add comment"), "editOutlined", [this, commented] {
            w.apply({{"op", "renameNode"}, {"id", nodeId_}, {"title", commented ? QString() : QStringLiteral("comment")}});
        }, {.tooltip = commented ? tr("Delete the comment on this node") : tr("Add a comment to this node"),
            .reason = !editable ? locked : tr("This node type has its own title"), .enabled = editable && noteable});
        menu.item("group-into-subgraph", tr("Group into subgraph"), "accountTree", [this] { w.action("Group into subgraph"); },
            {.tooltip = tr("Move the selected nodes into a new subgraph node"), .reason = !editable ? locked : tr("The subgraph node is not in the catalog"), .enabled = w.menuActionEnabled("Group into subgraph")});
        if (const auto input = constantToInput(type); !input.isEmpty()) {
            const auto name = input.section('.', -1).chopped(5).toLower();
            menu.item("convert-to-input", tr("Convert to input node"), "swapHoriz", [this, input, name] { w.convertNodeType(nodeId_, input, name); },
                {.tooltip = tr("Convert this constant node to an input node"), .reason = locked, .enabled = editable});
        }
        if (const auto constant = inputToConstant(type); !constant.isEmpty()) {
            menu.item("convert-to-constant", tr("Convert to constant node"), "swapHoriz", [this, constant] { w.convertNodeType(nodeId_, constant, {}); },
                {.tooltip = tr("Convert this input node to a constant node"), .reason = locked, .enabled = editable});
        }
        menu.item("show-templates", tr("Show templates"), "search", [this] { w.action("templates"); }, {.tooltip = tr("Find templates using this node")});
        menu.item("select-same-type", tr("Select all %1 nodes").arg(type.section('.', -1)), "filterList", [this] { w.selectSameType(nodeId_); },
            {.tooltip = tr("Select all nodes of the same type")});
        menu.separator();
        menu.item("delete-node", tr("Delete node"), "deleteOutline", [this] { w.action("Delete"); },
            {.shortcut = hint("Delete"), .tooltip = tr("Delete this node"), .reason = locked, .enabled = editable, .destructive = true});
        return menu;
    }

    // SelectionContextMenu.tsx
    MenuBuilder selection() {
        MenuBuilder menu;
        const auto ids = w.selectedIds();
        const bool editable = !w.readOnly();
        const auto locked = w.readOnlyReason();
        bool anyParent = false;
        int bypassedCount = 0;
        for (const auto &id : ids) {
            const auto node = w.document_.node(id);
            anyParent = anyParent || !node["parent_id"].toString().isEmpty();
            bypassedCount += node["ui_properties"].toObject()["bypassed"].toBool() ? 1 : 0;
        }
        const bool majorityBypassed = !ids.isEmpty() && bypassedCount >= ids.size() / 2.0;
        const bool connected = w.session_.connected();
        const bool running = w.runActive();
        menu.header(tr("Selection"));
        menu.item("chat-about-selection", tr("Chat about selection"), "forumOutlined", [this] { chatAbout(); },
            {.tooltip = tr("Open the chat with the selected nodes in the prompt")});
        menu.separator();
        menu.item("duplicate", tr("Duplicate"), "queue", [this] { w.action("Duplicate"); }, {.shortcut = hint("Ctrl+D"), .reason = locked, .enabled = editable});
        menu.item("copy", tr("Copy"), "copyAll", [this] { w.action("Copy"); }, {.shortcut = hint("Ctrl+C")});
        menu.item("cut", tr("Cut"), "contentCut", [this] { w.action("Cut"); }, {.shortcut = hint("Ctrl+X"), .reason = locked, .enabled = editable});
        menu.item("run-selected", tr("Run selected"), "playArrow", [this] { w.action("Run selected"); },
            {.tooltip = tr("Run the selected nodes as their own job"), .reason = !editable ? locked : tr("Connect to a server to run nodes"), .enabled = editable && connected && !running});
        if (ids.size() > 1) {
            menu.item("align", tr("Align"), "formatAlignLeft", [this] { w.action("Align"); }, {.shortcut = hint("A"), .reason = locked, .enabled = editable});
            menu.item("arrange", tr("Arrange"), "formatAlignLeft", [this] { w.action("Align with spacing"); }, {.shortcut = hint("Shift+A"), .reason = locked, .enabled = editable});
        }
        menu.item("toggle-bypass", majorityBypassed ? tr("Enable all") : tr("Disable all"), "block",
            [this, majorityBypassed] { w.action(majorityBypassed ? "Enable selected" : "Disable selected"); }, {.shortcut = hint("B"), .reason = locked, .enabled = editable});
        menu.item("collapse-expand", tr("Collapse / expand"), "unfoldLess", [this] { w.action("Toggle collapse"); },
            {.shortcut = hint("C"), .reason = !editable ? locked : tr("Groups and comments have no collapsed state"), .enabled = editable && w.menuActionEnabled("Toggle collapse")});
        if (!anyParent) {
            menu.item("surround-with-group", tr("Surround with group"), "groupWork", [this] { w.action("Group selection"); },
                {.shortcut = hint("Ctrl+G"), .reason = locked, .enabled = editable && !ids.isEmpty()});
        }
        menu.item("group-into-subgraph", tr("Group into subgraph"), "accountTree", [this] { w.action("Group into subgraph"); },
            {.tooltip = tr("Move the selected nodes into a new subgraph node"), .reason = !editable ? locked : tr("The subgraph node is not in the catalog"), .enabled = w.menuActionEnabled("Group into subgraph")});
        if (anyParent) {
            menu.item("remove-from-group", tr("Remove from group"), "groupWork", [this] { w.action("Remove from group"); },
                {.tooltip = tr("Right-click"), .reason = locked, .enabled = editable});
        }
        menu.separator();
        menu.header(tr("Connected"));
        menu.item("select-connected-all", tr("Select all connected"), "callSplit", [this] { w.selectConnected("both"); }, {.shortcut = hint("Shift+C"), .enabled = !ids.isEmpty()});
        menu.item("select-inputs", tr("Select inputs"), "arrowBack", [this] { w.selectConnected("upstream"); }, {.shortcut = hint("Shift+I"), .enabled = !ids.isEmpty()});
        menu.item("select-outputs", tr("Select outputs"), "arrowForward", [this] { w.selectConnected("downstream"); }, {.shortcut = hint("Shift+O"), .enabled = !ids.isEmpty()});
        menu.separator();
        menu.item("delete", tr("Delete"), "removeCircle", [this] { w.action("Delete"); },
            {.shortcut = QStringLiteral("%1 / %2").arg(hint("Backspace"), hint("Delete")), .reason = locked, .enabled = editable, .destructive = true});
        return menu;
    }

    // EdgeContextMenu.tsx
    MenuBuilder edge() {
        MenuBuilder menu;
        // Const, so reading an absent key does not insert it and break the staleness comparison.
        const auto original = [this] {
            for (const auto &value : w.document_.edges()) {
                const auto candidate = value.toObject();
                if (candidate["id"].toString() == edgeId_) {
                    return candidate;
                }
            }
            return QJsonObject{};
        }();
        if (original.isEmpty()) {
            return menu;
        }
        const auto data = original["data"].toObject();
        const bool control = original["sourceHandle"] == "__control__" || original["targetHandle"] == "__control__" || original["type"] == "control"
            || original["edge_type"] == "control" || data["edge_type"] == "control";
        const bool editable = !w.readOnly();
        const auto locked = w.readOnlyReason();
        const auto present = [this, original] {
            for (const auto &value : w.document_.edges()) {
                if (value.toObject() == original) {
                    return true;
                }
            }
            return false;
        };
        if (!control) {
            const bool known = w.knownNodeType("nodetool.control.Reroute");
            menu.item("insert-reroute", tr("Insert reroute"), "route", [this, present] {
                if (present()) {
                    w.apply({{"op", "insertReroute"}, {"id", edgeId_}, {"position", QJsonObject{{"x", scene_.x()}, {"y", scene_.y()}}}});
                }
            }, {.tooltip = tr("Insert a reroute node at this position"), .reason = !editable ? locked : tr("The reroute node is not in the catalog"), .enabled = editable && known});
            menu.separator();
        }
        menu.item("delete-edge", tr("Delete edge"), "deleteOutline", [this, present] {
            if (present()) {
                w.apply({{"op", "removeEdge"}, {"id", edgeId_}});
            }
        }, {.tooltip = tr("Delete this connection\nMiddle mouse button or select the edge and press Delete or Backspace.\nSelect many edges by holding Ctrl or Meta while clicking."),
            .reason = locked, .enabled = editable, .destructive = true});
        return menu;
    }

    // The lineage link menu of LineageLayer.
    MenuBuilder link() {
        MenuBuilder menu;
        menu.item("delete-link", tr("Delete link"), "deleteOutline", [this] { w.apply({{"op", "removeLink"}, {"id", edgeId_}}); },
            {.tooltip = tr("Remove this lineage link. Data connections are not affected."), .reason = w.readOnlyReason(), .enabled = !w.readOnly(), .destructive = true});
        return menu;
    }

private:
    static QString tr(const char *text) { return EditorWindow::tr(text); }
    void chatAbout() { w.chatAboutSelection(); }
    static QString constantToInput(const QString &type) {
        static const QHash<QString, QString> map{
            {"nodetool.constant.String", "nodetool.input.StringInput"}, {"nodetool.constant.Integer", "nodetool.input.IntegerInput"},
            {"nodetool.constant.Float", "nodetool.input.FloatInput"}, {"nodetool.constant.Bool", "nodetool.input.BooleanInput"},
            {"nodetool.constant.Image", "nodetool.input.ImageInput"}, {"nodetool.constant.Video", "nodetool.input.VideoInput"},
            {"nodetool.constant.Audio", "nodetool.input.AudioInput"}, {"nodetool.constant.Document", "nodetool.input.DocumentInput"},
            {"nodetool.constant.DataFrame", "nodetool.input.DataframeInput"}, {"nodetool.constant.Model3D", "nodetool.input.Model3DInput"}};
        return map.value(type);
    }
    static QString inputToConstant(const QString &type) {
        static const QHash<QString, QString> map{
            {"nodetool.input.StringInput", "nodetool.constant.String"}, {"nodetool.input.IntegerInput", "nodetool.constant.Integer"},
            {"nodetool.input.FloatInput", "nodetool.constant.Float"}, {"nodetool.input.BooleanInput", "nodetool.constant.Bool"},
            {"nodetool.input.ImageInput", "nodetool.constant.Image"}, {"nodetool.input.VideoInput", "nodetool.constant.Video"},
            {"nodetool.input.AudioInput", "nodetool.constant.Audio"}, {"nodetool.input.DocumentInput", "nodetool.constant.Document"},
            {"nodetool.input.DataframeInput", "nodetool.constant.DataFrame"}, {"nodetool.input.Model3DInput", "nodetool.constant.Model3D"}};
        return map.value(type);
    }
    EditorWindow &w;
    QString nodeId_;
    QString edgeId_;
    QPointF scene_;
    QPoint global_;
};

QString EditorWindow::shortcutCommand(int key, Qt::KeyboardModifiers modifiers) const {
 const QKeySequence pressed(QKeyCombination(modifiers, Qt::Key(key)));
 for (const auto &entry : shortcuts) {
  if (pressed == QKeySequence(QString::fromLatin1(entry.keys))) { return QString::fromLatin1(entry.command); }
 }
 return {};
}
bool EditorWindow::menuActionEnabled(const QString &name) const {
 const auto count = selectedCount();
    if (name == "Group into subgraph") {
        return !readOnly() && count > 0 && knownNodeType("nodetool.workflows.subgraph.Subgraph");
    }
 if (name == "Select all connected" || name == "Select inputs" || name == "Select outputs") { return count > 0; }
 if (name == "Focus node") { return count == 1; }
 if (name == "Open child") { return count == 1 && node_editor::isChildNode(document_.node(selectedIds().first())); }
 if (name == "Link selected") { return !readOnly() && count == 2; }
 if (!quickAddNodeType(name).isEmpty()) { return !readOnly() && knownNodeType(quickAddNodeType(name)); }
 if (name == "Stop") { return runActive() && (session_.connected() || session_.runsInProcess(run_)); }
 if (name == "Undo") { return !readOnly() && document_.undoStack()->canUndo(); }
 if (name == "Redo") { return !readOnly() && document_.undoStack()->canRedo(); }
 if (name == "Copy") { return count > 0; }
 if (name == "Paste") { return !readOnly() && QJsonDocument::fromJson(QApplication::clipboard()->text().toUtf8()).isObject(); }
 if (name == "Run") { return !readOnly() && (session_.connected() || session_.localRunnerReady()); }
 if (name == "Run selected") { return !readOnly() && count > 0 && (!runActive() || singleRunnableCardSelected()) && (session_.connected() || session_.localRunnerReady()); }
 if (name.startsWith("Align") || name.startsWith("Distribute") || name == "Stack selection" || name == "Arrange grid" || name == "Layout selection" || name == "Arrange selection") { return !readOnly() && count >= 2; }
 if (name == "Delete" || name == "Cut" || name == "Duplicate" || name == "Duplicate vertical" || name == "Group selection" || name == "Disable toggle" || name == "Disable selected" || name == "Enable selected") { return !readOnly() && count > 0; }
 if (name == "Toggle collapse") {
  if (readOnly()) { return false; }
  for (const auto &id : selectedIds()) {
   const auto type = document_.node(id)["type"].toString();
   if (!type.endsWith(".Group") && !type.endsWith(".Comment") && !type.endsWith(".Reroute")) { return true; }
  }
  return false;
 }
 if (name == "Remove from group") {
  if (readOnly()) { return false; }
  for (const auto &id : selectedIds()) { if (!document_.node(id)["parent_id"].toString().isEmpty()) { return true; } }
  return false;
 }
 if (name == "Ungroup" || name == "Rename group") {
  if (readOnly() || count != 1) { return false; }
  return document_.node(selectedIds().first())["type"].toString().endsWith(".Group");
 }
 if (name == "Edit note" || name == "Rename node" || name == "Edit comment") {
  if (readOnly() || count != 1) { return false; }
  const auto type = document_.node(selectedIds().first())["type"].toString();
  if (name == "Edit comment") { return type.endsWith(".Comment") && !document_.node(selectedIds().first())["data"].toObject()["comment"].isObject(); }
  if (name == "Edit note") { return !type.endsWith(".Group") && !type.endsWith(".Comment") && type != "nodetool.code.Code"; }
  return true;
 }
 if (name == "Add comment" || name == "Add node" || name == "Auto layout") { return !readOnly(); }
 return true;
}

bool EditorWindow::contextAction(const QString &name) {
    if (name == "Select all connected") { return selectConnected("both"); }
    if (name == "Select inputs") { return selectConnected("upstream"); }
    if (name == "Select outputs") { return selectConnected("downstream"); }
    return false;
}

// Replaces the selection without notifying per node: every listener does work
// that grows with the graph, so the whole change notifies once.
static void replaceSelection(EditorScene &scene, WorkflowGraphModel &model, const QSet<QString> &ids) {
    QSignalBlocker blocker(&scene);
    scene.clearSelection();
    for (const auto id : model.allNodeIds()) {
        if (ids.contains(model.resourceId(id))) {
            if (auto *item = scene.nodeGraphicsObject(id)) {
                item->setSelected(true);
            }
        }
    }
    blocker.unblock();
    emit scene.selectionChanged();
}

// useSelectConnected.ts: every node reachable through the data edges.
bool EditorWindow::selectConnected(const QString &direction) {
    const auto start = selectedIds();
    if (start.isEmpty()) {
        return false;
    }
    QHash<QString, QStringList> incoming, outgoing;
    for (const auto &value : document_.edges()) {
        const auto edge = value.toObject();
        incoming[edge["target"].toString()].append(edge["source"].toString());
        outgoing[edge["source"].toString()].append(edge["target"].toString());
    }
    QSet<QString> result(start.cbegin(), start.cend());
    const auto walk = [&](const QHash<QString, QStringList> &adjacency) {
        QSet<QString> visited;
        QStringList stack = start;
        while (!stack.isEmpty()) {
            const auto id = stack.takeLast();
            if (visited.contains(id)) {
                continue;
            }
            visited.insert(id);
            for (const auto &next : adjacency.value(id)) {
                result.insert(next);
                stack.append(next);
            }
        }
    };
    if (direction == "upstream" || direction == "both") { walk(incoming); }
    if (direction == "downstream" || direction == "both") { walk(outgoing); }
    replaceSelection(*scene_, model_, result);
    return true;
}

void EditorWindow::selectSameType(const QString &nodeId) {
    const auto type = document_.node(nodeId)["type"].toString();
    QSet<QString> same;
    for (const auto id : model_.allNodeIds()) {
        const auto resource = model_.resourceId(id);
        if (document_.node(resource)["type"].toString() == type) {
            same.insert(resource);
        }
    }
    replaceSelection(*scene_, model_, same);
}

// NodeTypeMapping.ts: a constant becomes the matching input node, and back.
void EditorWindow::convertNodeType(const QString &nodeId, const QString &type, const QString &inputName) {
    auto graph = document_.graph();
    auto nodes = graph["nodes"].toArray();
    for (qsizetype index = 0; index < nodes.size(); ++index) {
        auto node = nodes[index].toObject();
        if (node["id"].toString() != nodeId) {
            continue;
        }
        node["type"] = type;
        if (!inputName.isEmpty()) {
            auto data = node["data"].toObject();
            data["name"] = inputName;
            node["data"] = data;
        }
        nodes[index] = node;
    }
    graph["nodes"] = nodes;
    if (apply({{"op", "replaceGraph"}, {"graph", graph}})) {
        selectNode(nodeId);
    }
}

void EditorWindow::showContextMenu(const QString &kind, const QPoint &globalPosition, const QString &nodeId, const QString &edgeId, const QPointF &scenePosition) {
    if (contextMenuHost_) {
        contextMenuHost_->hide();
        contextMenuHost_->deleteLater();
    }
    // The entry actions capture the builder, so the dispatcher keeps it alive.
    const auto builder = std::make_shared<ContextMenuBuilder>(*this, nodeId, edgeId, scenePosition.isNull() ? view_->mapToScene(view_->viewport()->mapFromGlobal(globalPosition)) : scenePosition, globalPosition);
    MenuBuilder menu = kind == "pane" ? builder->pane() : kind == "selection" ? builder->selection() : kind == "edge" ? builder->edge() : kind == "link" ? builder->link() : builder->node();
    if (menu.entries().isEmpty()) {
        return;
    }
    const auto epoch = documentEpoch_;
    const auto credentials = credentialsEpoch_;
    const auto selection = selectedIds();
    const QPointer<QWidget> prior = QApplication::focusWidget();
    auto *host = new QQuickWidget(engine_, this);
    contextMenuHost_ = host;
    host->setObjectName("context-menu-host");
    host->setProperty("menuKind", kind);
    host->setAttribute(Qt::WA_AlwaysStackOnTop);
    host->setAttribute(Qt::WA_TranslucentBackground);
    host->setClearColor(Qt::transparent);
    host->setResizeMode(QQuickWidget::SizeRootObjectToView);
    host->setGeometry(rect());
    auto *dispatch = new MenuDispatch(host);
    const auto actions = menu.actions();
    dispatch->invoke = [this, host, epoch, credentials, selection, actions, prior, builder](const QString &id) {
        if (!host->isVisible()) {
            return;
        }
        host->hide();
        host->deleteLater();
        if (prior) {
            prior->setFocus();
        }
        if (id.isEmpty() || epoch != documentEpoch_ || credentials != credentialsEpoch_ || selection != selectedIds()) {
            return;
        }
        if (const auto run = actions.value(id)) {
            run();
        }
    };
    connect(this, &EditorWindow::documentEpochChanged, host, [dispatch] { dispatch->choose(""); });
    connect(this, &EditorWindow::credentialsEpochChanged, host, [dispatch] { dispatch->choose(""); });
    host->setInitialProperties({{"dispatch", QVariant::fromValue(dispatch)}, {"entries", menu.entries()}});
    host->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/ContextMenuPanel.qml"));
    if (!host->rootObject()) {
        host->deleteLater();
        return;
    }
    host->show();
    host->raise();
    host->setFocus();
    const auto local = mapFromGlobal(globalPosition);
    QMetaObject::invokeMethod(host->rootObject(), "popupAt", Q_ARG(QVariant, local.x()), Q_ARG(QVariant, local.y()));
}

// The nodes whose title, type, ID, or property names and values contain the term.
static QVariantList searchNodes(const QJsonArray &nodes, const QHash<QString, QString> &titles, const QString &term) {
    const auto needle = term.trimmed().toLower();
    QVariantList results;
    const auto flatten = [](const QJsonValue &value) {
        if (value.isString()) {
            return value.toString();
        }
        if (value.isDouble() || value.isBool()) {
            return value.isBool() ? QString(value.toBool() ? "true" : "false") : QString::number(value.toDouble(), 'g', 15);
        }
        if (value.isObject()) {
            return QString::fromUtf8(QJsonDocument(value.toObject()).toJson(QJsonDocument::Compact));
        }
        if (value.isArray()) {
            return QString::fromUtf8(QJsonDocument(value.toArray()).toJson(QJsonDocument::Compact));
        }
        return QString();
    };
    const auto snippet = [&](const QString &value) {
        const auto compact = value.simplified();
        const auto at = compact.toLower().indexOf(needle);
        const auto start = std::max<qsizetype>(0, at - 28);
        const auto end = std::min<qsizetype>(compact.size(), at + needle.size() + 48);
        return QStringLiteral("%1%2%3").arg(start > 0 ? QString::fromUtf8("…") : QString(), compact.mid(start, end - start), end < compact.size() ? QString::fromUtf8("…") : QString());
    };
    for (const auto &entry : nodes) {
        const auto node = entry.toObject();
        const auto id = node["id"].toString();
        const auto type = node["type"].toString();
        // A note is the web node title, so it names the node when present.
        const auto note = node["ui_properties"].toObject()["title"].toString().trimmed();
        const auto header = titles.value(id, type.section('.', -1));
        const auto title = note.isEmpty() ? header : note;
        QVariantMap result{{"id", id}, {"title", title}, {"type", type}, {"field", QString()}, {"snippet", QString()}};
        if (title.toLower().contains(needle) || header.toLower().contains(needle) || type.toLower().contains(needle) || id.toLower().contains(needle)) {
            results.append(result);
            continue;
        }
        const auto search = [&](const QJsonObject &values, const QString &prefix) {
            for (auto it = values.begin(); it != values.end(); ++it) {
                const auto text = flatten(it.value());
                if (text.isEmpty()) {
                    continue;
                }
                const auto field = prefix + it.key();
                if (field.toLower().contains(needle) || text.toLower().contains(needle)) {
                    result["field"] = field;
                    result["snippet"] = snippet(text);
                    return true;
                }
            }
            return false;
        };
        if (search(node["data"].toObject(), QString()) || search(node["dynamic_properties"].toObject(), "dynamic.")) {
            results.append(result);
        }
    }
    return results;
}

// Moves the canvas to a found node at 100% zoom over 300 ms, as setCenter does.
void EditorWindow::revealFound(const QString &resourceId) {
    fitActive_ = false;
    if (!selectNode(resourceId)) {
        return;
    }
    // Selection queues its own reveal. This runs after it and settles the view.
    QMetaObject::invokeMethod(this, [this, resourceId] {
        std::optional<QtNodes::NodeId> found;
        for (const auto id : model_.allNodeIds()) {
            if (model_.resourceId(id) == resourceId) {
                found = id;
            }
        }
        if (!found) {
            return;
        }
        const auto item = scene_->nodeGraphicsObject(*found);
        const auto target = item->mapRectToScene(QRectF(QPointF(), QSizeF(model_.layout(*found).size))).center();
        moveViewTo(1.0, centerOnArea(target, 1.0), 300);
    }, Qt::QueuedConnection);
}

void EditorWindow::showFindPanel() {
    if (findPanel_) {
        findPanel_->raise();
        if (findPanel_->rootObject()) {
            QMetaObject::invokeMethod(findPanel_->rootObject(), "activate");
        }
        return;
    }
    auto *panel = new QQuickWidget(engine_, this);
    findPanel_ = panel;
    panel->setObjectName("find-panel");
    panel->setAttribute(Qt::WA_AlwaysStackOnTop);
    panel->setAttribute(Qt::WA_TranslucentBackground);
    panel->setClearColor(Qt::transparent);
    panel->setResizeMode(QQuickWidget::SizeViewToRootObject);
    auto *controller = new FindController(panel);
    controller->search = [this](const QString &term) {
        QHash<QString, QString> titles;
        for (const auto id : model_.allNodeIds()) {
            titles.insert(model_.resourceId(id), model_.layout(id).title);
        }
        return searchNodes(document_.nodes(), titles, term);
    };
    controller->reveal = [this](const QString &id) { revealFound(id); };
    controller->dismiss = [this, panel] {
        if (!panel->isVisible()) {
            return;
        }
        panel->hide();
        panel->deleteLater();
        if (view_) {
            view_->setFocus();
        }
    };
    connect(this, &EditorWindow::documentEpochChanged, panel, [controller] { controller->close(); });
    connect(this, &EditorWindow::credentialsEpochChanged, panel, [controller] { controller->close(); });
    new FindPanelFilter(panel, this, [controller] { controller->close(); });
    panel->setInitialProperties({{"controller", QVariant::fromValue(controller)}});
    panel->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/FindPanel.qml"));
    if (!panel->rootObject()) {
        panel->deleteLater();
        return;
    }
    panel->move(width() - panel->width() - 20, 60);
    panel->show();
    panel->raise();
    panel->setFocus();
    QMetaObject::invokeMethod(panel->rootObject(), "activate");
}

void EditorWindow::chatAboutSelection() {
    if (!tabOwner_) { activeEditor_->chatAboutSelection(); return; }
    const auto ids = selectedIds();
    QStringList items;
    for (const auto &id : ids) {
        const auto node = document_.node(id);
        auto title = node["ui_properties"].toObject()["title"].toString().trimmed();
        if (title.isEmpty()) {
            title = node["type"].toString().section('.', -1);
        }
        items.append(QStringLiteral("\"%1\" (id %2)").arg(title, id));
    }
    if (ids.size() == 1) {
        const auto node = document_.node(ids.first());
        auto title = node["ui_properties"].toObject()["title"].toString().trimmed();
        if (title.isEmpty()) {
            title = node["type"].toString().section('.', -1);
        }
        askAgent(QStringLiteral("About the \"%1\" node (id %2): ").arg(title, ids.first()));
    } else {
        askAgent(QStringLiteral("About these nodes: %1. ").arg(items.join(", ")));
    }
}

void EditorWindow::showNodeMenu(const QPointF &global) {
    if (!tabOwner_) { activeEditor_->showNodeMenu(global); return; }
    const auto ids = selectedIds();
    if (ids.size() != 1) { return; }
    showContextMenu("node", global.toPoint(), ids.first());
}

void EditorWindow::showActionMenu(const QString &kind, const QPoint &position) {
 if (kind == "pane" || kind == "node" || kind == "group" || kind == "selection") {
  showContextMenu(kind == "group" ? QString("node") : kind, position, kind == "pane" || kind == "selection" ? QString() : selectedIds().value(0));
  return;
 }
 auto *menu = new QMenu(this);
 menu->setObjectName(kind + "-menu"); menu->setAttribute(Qt::WA_DeleteOnClose);
 const auto epoch = documentEpoch_, credentials = credentialsEpoch_;
 const auto selection = selectedIds();
 connect(this, &EditorWindow::documentEpochChanged, menu, &QMenu::close);
 connect(this, &EditorWindow::credentialsEpochChanged, menu, &QMenu::close);
 if (kind == "command" || kind == "shortcuts") {
  // native-rules #2: naked delete on a Qt child that also has a parent or scene owner
  delete menu;
  auto *panel = new QDialog(this, Qt::Popup | Qt::FramelessWindowHint);
  panel->setObjectName(kind + "-panel");
  panel->setAttribute(Qt::WA_TranslucentBackground);
  panel->setAttribute(Qt::WA_DeleteOnClose);
  auto *dispatch = new MenuDispatch(panel);
  dispatch->invoke = [this, panel, epoch, credentials, selection](const QString &name) {
   if (!panel->isVisible() || epoch != documentEpoch_ || credentials != credentialsEpoch_ || selection != selectedIds()) { return; }
   if (name.isEmpty()) { panel->close(); return; }
   if (!menuActionEnabled(name)) { return; }
   panel->close(); userAction(name);
  };
  connect(this, &EditorWindow::documentEpochChanged, panel, &QDialog::close);
  connect(this, &EditorWindow::credentialsEpochChanged, panel, &QDialog::close);
  QStringList names;
  QMap<QString, QStringList> keys;
  QMap<QString, QVariantList> combos;
  for (const auto &entry : shortcuts) {
   const auto name = QString::fromLatin1(entry.command);
   if (!names.contains(name)) { names.append(name); }
   keys[name].append(QKeySequence(QString::fromLatin1(entry.keys)).toString(QKeySequence::NativeText));
   combos[name].append(webKeys(QString::fromLatin1(entry.keys)));
  }
  if (kind == "command") { names += QStringList{"Add comment", "Run selected", "Disable selected", "Enable selected", "Auto layout", "Zoom in", "Zoom out", "Reset zoom", "Stop", "Open file", "Layout selection", "Remove from group", "Ungroup", "Rename group", "Edit note", "Rename node", "Edit comment", "Output", "Toggle nodes", "Toggle mini-map", "Fit selection", "Focus node", "Zoom presets", "Connect", "Server Open", "Server Save", "Reconnect", "Server sync", "Run trace", "Version history", "Share workflow", "Workflow metadata", "Canvas uploads", "Link selected", "Group into subgraph", "Open child", "Linked workflows"}; }
  names.removeDuplicates();
  const auto group = [](const QString &name) {
   if (name.startsWith("Align") || name.startsWith("Distribute") || name == "Stack selection" || name == "Arrange grid") { return QString("Layout & Alignment"); }
   if (name == "Output" || name == "Toggle nodes" || name == "Toggle inspector" || name == "Workflows") { return QString("Panels"); }
   if (name.startsWith("Move") || name.startsWith("Fit") || name.startsWith("Focus") || name.startsWith("Zoom") || name.startsWith("Toggle") || name == "Workflows") { return QString("View"); }
   if (name == "Run" || name == "Stop" || name == "Save" || name.startsWith("Open")) { return QString("Workflow"); }
   return QString("Edit");
  };
  QVariantList rows;
  for (const auto &section : {QString("Workflow"), QString("Edit"), QString("Layout & Alignment"), QString("View"), QString("Panels")}) {
   for (const auto &name : names) {
    if (group(name) != section) { continue; }
    QVariantList webCombos;
    for (const auto &combo : combos[name]) { webCombos.append(QVariant(combo)); }
    rows.append(QVariantMap{{"label", name}, {"section", section}, {"keys", keys[name].join(" / ")}, {"available", menuActionEnabled(name)}, {"category", helpCategory(name)}, {"combos", webCombos}});
   }
  }
  auto *quick = new QQuickWidget(engine_, panel);
  quick->setResizeMode(QQuickWidget::SizeRootObjectToView);
  quick->setAttribute(Qt::WA_TranslucentBackground);
  quick->setClearColor(Qt::transparent);
  const bool german = QLocale().name().startsWith("de");
#ifdef Q_OS_MACOS
  const QString platform = "mac";
#else
  const QString platform = "win";
#endif
  quick->setInitialProperties({{"dispatch", QVariant::fromValue(dispatch)}, {"rows", rows}, {"help", kind == "shortcuts"}, {"os", platform}, {"layoutName", german ? "german" : "english"}});
  quick->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/ActionPanel.qml"));
  auto *layout = new QVBoxLayout(panel); layout->setContentsMargins(0,0,0,0); layout->addWidget(quick);
  const bool help = kind == "shortcuts";
  const QSize wanted = help ? QSize(880, 760) : QSize(560, 620);
  panel->resize(wanted.boundedTo(size() - QSize(32, 32)));
  panel->move(mapToGlobal(rect().center()) - QPoint(panel->width() / 2, panel->height() / 2));
  panel->show(); quick->setFocus();
  QMetaObject::invokeMethod(quick->rootObject(), "activate");
  return;
 }
 {
  QStringList names;
  if (kind == "more") { names = {instantUpdate_ ? "Instant Update: On" : "Instant Update: Off", "Open child", "Linked workflows","Stop", "Run selected", "Disable selected", "Enable selected", "Find node", "Auto layout", "Layout selection", "Arrange selection", "Link selected", "Group selection", "Group into subgraph", "Ungroup", "Remove from group", "Rename group", "Rename node", "Edit note", "Add comment", "Edit comment", "Open file", "Save", "Server Open", "Server Save", "Server sync", "Run trace", "Version history", "Share workflow", "Workflow metadata", "Reconnect", "Canvas uploads", "Command menu", "Keyboard shortcuts"}; }
#ifndef Q_OS_MACOS
  if (kind == "more") { names.insert(1, mouseNavigation() ? "Canvas navigation: Mouse" : "Canvas navigation: Trackpad"); }
#endif
  for (const auto &name : names) {
   auto *item = menu->addAction(name);
   item->setEnabled(menuActionEnabled(name));
   connect(item, &QAction::triggered, this, [this, name, epoch, credentials, selection] {
    if (epoch != documentEpoch_ || credentials != credentialsEpoch_ || selection != selectedIds() || !menuActionEnabled(name)) { return; }
    userAction(name);
   });
  }
 }
 menu->popup(position);
}
}

#include "EditorMenus.moc"
