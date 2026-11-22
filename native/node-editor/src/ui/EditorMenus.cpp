#include "ui/CanvasOverlay.h"
#include "ui/CommandScore.h"
#include "EditorWindow.h"
#include "EntryMenu.h"
#include "document/ChildPorts.h"
#include "canvas/CanvasStyle.h"
#include "graph/CanvasMediaPresenter.h"
#include <QApplication>
#include <QUuid>
#include <QMouseEvent>
#include <QLocale>
#include <QKeySequence>
#include <QClipboard>
#include <QJsonDocument>
#include <QDialog>
#include <QVBoxLayout>
#include <QQuickWidget>
#include <QQuickItem>
#include <QQmlEngine>
#include <QTimer>
#include <QVariantAnimation>
#include <QSignalBlocker>
#include "ui/CanvasSurface.h"
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

// UI thread only. Parented to its QQuickWidget host. Owns the command entries,
// cmdk-compatible fuzzy filtering/ranking, and keyboard selection cursor.
class CommandMenuController final : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString query READ query NOTIFY queryChanged)
    Q_PROPERTY(QVariantList rows READ rows NOTIFY rowsChanged)
    Q_PROPERTY(int selectedIndex READ selectedIndex NOTIFY selectionChanged)
public:
    struct Entry {
        QString id;
        QString label;
        QString section;
        QString icon;
        QStringList shortcuts;
        QStringList keywords;
        bool available = true;
        bool guardDocument = true;
        std::function<void()> run;
    };

    explicit CommandMenuController(QObject *parent) : QObject(parent) {}

    std::function<void()> onClose;
    std::function<void(const Entry &)> onActivate;

    void setEntries(std::vector<Entry> entries) {
        entries_ = std::move(entries);
        sectionOrder_.clear();
        for (const auto &entry : entries_) {
            if (!sectionOrder_.contains(entry.section)) {
                sectionOrder_.append(entry.section);
            }
        }
        rebuild();
    }

    QString query() const { return query_; }
    QVariantList rows() const { return rows_; }
    int selectedIndex() const { return selectedIndex_; }

    Q_INVOKABLE void setQuery(const QString &query) {
        if (query_ == query) {
            return;
        }
        query_ = query;
        emit queryChanged();
        rebuild();
    }

    Q_INVOKABLE void selectIndex(int index) {
        if (index < 0 || index >= static_cast<int>(visible_.size())) {
            return;
        }
        if (!entries_[visible_[static_cast<std::size_t>(index)]].available) {
            return;
        }
        if (selectedIndex_ != index) {
            selectedIndex_ = index;
            emit selectionChanged();
        }
    }

    Q_INVOKABLE void selectFirst() {
        const int next = firstEnabled();
        if (next != selectedIndex_) {
            selectedIndex_ = next;
            emit selectionChanged();
        }
    }

    Q_INVOKABLE void selectLast() {
        const int next = lastEnabled();
        if (next != selectedIndex_) {
            selectedIndex_ = next;
            emit selectionChanged();
        }
    }

    Q_INVOKABLE void move(int delta) {
        if (visible_.empty() || delta == 0) {
            return;
        }
        const int step = delta > 0 ? 1 : -1;
        if (selectedIndex_ < 0) {
            const int fallback = step > 0 ? firstEnabled() : lastEnabled();
            if (fallback >= 0) {
                selectedIndex_ = fallback;
                emit selectionChanged();
            }
            return;
        }
        for (int index = selectedIndex_ + step; index >= 0 && index < static_cast<int>(visible_.size()); index += step) {
            if (entries_[visible_[static_cast<std::size_t>(index)]].available) {
                selectedIndex_ = index;
                emit selectionChanged();
                return;
            }
        }
    }

    Q_INVOKABLE void movePage(int delta) {
        if (visible_.empty() || delta == 0) {
            return;
        }
        constexpr int kPageSteps = 6;
        const int step = delta > 0 ? 1 : -1;
        int target = selectedIndex_ < 0 ? (step > 0 ? firstEnabled() : lastEnabled()) : selectedIndex_;
        if (target < 0) {
            return;
        }
        int remaining = kPageSteps;
        for (int index = target + step; index >= 0 && index < static_cast<int>(visible_.size()) && remaining > 0; index += step) {
            if (entries_[visible_[static_cast<std::size_t>(index)]].available) {
                target = index;
                --remaining;
            }
        }
        if (target != selectedIndex_) {
            selectedIndex_ = target;
            emit selectionChanged();
        }
    }

    Q_INVOKABLE void moveGroup(int delta) {
        if (visible_.empty() || delta == 0) {
            return;
        }
        const int step = delta > 0 ? 1 : -1;
        if (selectedIndex_ < 0) {
            move(step);
            return;
        }
        const QString currentSection = entries_[visible_[static_cast<std::size_t>(selectedIndex_)]].section;
        if (step > 0) {
            for (int index = selectedIndex_ + 1; index < static_cast<int>(visible_.size()); ++index) {
                const auto &entry = entries_[visible_[static_cast<std::size_t>(index)]];
                if (entry.section != currentSection && entry.available) {
                    selectedIndex_ = index;
                    emit selectionChanged();
                    return;
                }
            }
        } else {
            // Find the previous section that contains at least one enabled item,
            // then land on that section's first enabled item (matching cmdk).
            QString previousSection;
            int firstInPrevious = -1;
            for (int index = selectedIndex_ - 1; index >= 0; --index) {
                const auto &entry = entries_[visible_[static_cast<std::size_t>(index)]];
                if (entry.section == currentSection) {
                    continue;
                }
                if (previousSection.isEmpty()) {
                    if (!entry.available) {
                        continue;
                    }
                    previousSection = entry.section;
                    firstInPrevious = index;
                } else if (entry.section == previousSection) {
                    if (entry.available) {
                        firstInPrevious = index;
                    }
                } else {
                    break;
                }
            }
            if (firstInPrevious >= 0) {
                selectedIndex_ = firstInPrevious;
                emit selectionChanged();
                return;
            }
        }
        move(step);
    }

    Q_INVOKABLE void activate(int index) {
        if (index < 0 || index >= static_cast<int>(visible_.size())) {
            return;
        }
        const auto &entry = entries_[visible_[static_cast<std::size_t>(index)]];
        if (!entry.available) {
            return;
        }
        if (onActivate) {
            onActivate(entry);
        }
    }

    Q_INVOKABLE void activateCurrent() {
        activate(selectedIndex_);
    }

    Q_INVOKABLE void close() {
        if (onClose) {
            onClose();
        }
    }

signals:
    void queryChanged();
    void rowsChanged();
    void selectionChanged();

private:
    int firstEnabled() const {
        for (int index = 0; index < static_cast<int>(visible_.size()); ++index) {
            if (entries_[visible_[static_cast<std::size_t>(index)]].available) {
                return index;
            }
        }
        return -1;
    }

    int lastEnabled() const {
        for (int index = static_cast<int>(visible_.size()) - 1; index >= 0; --index) {
            if (entries_[visible_[static_cast<std::size_t>(index)]].available) {
                return index;
            }
        }
        return -1;
    }

    void rebuild() {
        visible_.clear();
        const QString trimmed = query_.trimmed();
        if (trimmed.isEmpty()) {
            visible_.reserve(entries_.size());
            for (std::size_t i = 0; i < entries_.size(); ++i) {
                visible_.push_back(i);
            }
        } else {
            struct Scored {
                std::size_t index;
                double score;
            };
            QHash<QString, std::vector<Scored>> bySection;
            for (std::size_t i = 0; i < entries_.size(); ++i) {
                const auto &entry = entries_[i];
                const double labelScore = command_menu::commandScore(entry.label, trimmed);
                QStringList keywords = entry.keywords;
                keywords.append(entry.section);
                const double combinedScore = command_menu::commandScore(entry.label, trimmed, keywords);
                const double score = std::max(labelScore, combinedScore * 0.99);
                if (score > 0.0) {
                    bySection[entry.section].push_back({i, score});
                }
            }
            struct RankedSection {
                QString name;
                double maxScore;
                int order;
            };
            std::vector<RankedSection> sections;
            sections.reserve(static_cast<std::size_t>(bySection.size()));
            for (int order = 0; order < sectionOrder_.size(); ++order) {
                const QString &name = sectionOrder_.at(order);
                auto it = bySection.find(name);
                if (it == bySection.end() || it->empty()) {
                    continue;
                }
                auto &items = it.value();
                std::stable_sort(items.begin(), items.end(), [](const Scored &a, const Scored &b) {
                    return a.score > b.score;
                });
                sections.push_back({name, items.front().score, order});
            }
            std::stable_sort(sections.begin(), sections.end(), [](const RankedSection &a, const RankedSection &b) {
                if (a.maxScore != b.maxScore) {
                    return a.maxScore > b.maxScore;
                }
                return a.order < b.order;
            });
            for (const auto &section : sections) {
                for (const auto &item : bySection[section.name]) {
                    visible_.push_back(item.index);
                }
            }
        }

        rows_.clear();
        rows_.reserve(static_cast<qsizetype>(visible_.size()));
        for (const std::size_t index : visible_) {
            const auto &entry = entries_[index];
            rows_.append(QVariantMap{
                {QStringLiteral("id"), entry.id},
                {QStringLiteral("label"), entry.label},
                {QStringLiteral("section"), entry.section},
                {QStringLiteral("icon"), entry.icon},
                {QStringLiteral("keys"), entry.shortcuts.join(QStringLiteral(" / "))},
                {QStringLiteral("shortcuts"), entry.shortcuts},
                {QStringLiteral("available"), entry.available}
            });
        }
        selectedIndex_ = firstEnabled();
        emit rowsChanged();
        emit selectionChanged();
    }

    std::vector<Entry> entries_;
    QStringList sectionOrder_;
    std::vector<std::size_t> visible_;
    QVariantList rows_;
    QString query_;
    int selectedIndex_ = -1;
};

// UI thread only. Keeps the full-window command palette overlay sized to its
// owner window across resizes. Parented to the overlay widget.
class CommandPanelFilter final : public QObject {
    Q_OBJECT
public:
    CommandPanelFilter(QQuickWidget *panel, QWidget *owner)
        : QObject(panel), panel_(panel), owner_(owner) {
        if (owner_) {
            owner_->installEventFilter(this);
        }
    }
    ~CommandPanelFilter() override {
        if (owner_) {
            owner_->removeEventFilter(this);
        }
    }
protected:
    bool eventFilter(QObject *object, QEvent *event) override {
        if (object == owner_ && event->type() == QEvent::Resize && panel_) {
            panel_->setGeometry(owner_->rect());
        }
        return false;
    }
private:
    QPointer<QQuickWidget> panel_;
    QPointer<QWidget> owner_;
};

// UI thread only. Frameless dialog for the keyboard shortcuts help panel that
// re-activates Quick focus once the native window becomes active.
class ShortcutsDialog final : public QDialog {
    Q_OBJECT
public:
    explicit ShortcutsDialog(QWidget *parent) : QDialog(parent, Qt::Dialog | Qt::FramelessWindowHint) {
        setAttribute(Qt::WA_TranslucentBackground);
        setAttribute(Qt::WA_DeleteOnClose);
    }
    QPointer<QQuickWidget> quick;
protected:
    bool event(QEvent *event) override {
        const bool handled = QDialog::event(event);
        if (event->type() == QEvent::WindowActivate && !focused_ && quick && quick->rootObject()) {
            focused_ = true;
            quick->setFocus(Qt::PopupFocusReason);
            QMetaObject::invokeMethod(quick->rootObject(), "activate", Qt::QueuedConnection);
        }
        return handled;
    }
private:
    bool focused_ = false;
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
 {"Add Prompt", "Shift+P"}, {"Add Text to Image", "Shift+G"}, {"Add Text to Video", "Shift+V"}, {"Add Agent", "Shift+L"},
 {"Focus next node", "Ctrl+Alt+N"}, {"Focus previous node", "Ctrl+Alt+P"}, {"Focus node above", "Alt+Up"}, {"Focus node below", "Alt+Down"},
 {"Focus node left", "Alt+Left"}, {"Focus node right", "Alt+Right"}, {"Focus back", "Ctrl+Alt+B"},
 {"Select focused node", "Return"}, {"Settings", "Ctrl+,"}, {"Workflow metadata", "W"},
 {"Node info", "Ctrl+I"}
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
        {
            const bool known = w.knownNodeType(QStringLiteral("nodetool.workflows.subgraph.Subgraph"));
            menu.item("add-comfy-subgraph", tr("Add Comfy subgraph"), "schema", [this] { w.addComfySubgraphAt(scene_); },
                {.tooltip = tr("Add a subgraph of ComfyUI nodes that runs as one Comfy job"),
                 .reason = editable ? tr("Not in the node catalog") : w.readOnlyReason(), .enabled = editable && known});
        }
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
 // Only the owner shares a cloud workflow, and the dialog needs its account.
 if (name == "Share") { return cloud_ && cloud_->role() == "owner" && (tabOwner_ ? tabOwner_ : this)->accountServers_; }
 // A project folder on this app's own server, with an account to send it with.
 if (name == "Publish to cloud" || name == "Synchronize") { return transferAvailable(); }
 if (name == "Node info") { return count > 0; }
 if (name == "Open child") { return count == 1 && node_editor::isChildNode(document_.node(selectedIds().first())); }
 if (name == "Link selected") { return !readOnly() && count == 2; }
 if (name == "Select focused node") { return !model_.focusedNode().isEmpty() && !document_.node(model_.focusedNode()).isEmpty(); }
 if (name == "Focus back") { return model_.focusHistorySize() > 1; }
 if (name.startsWith("Focus ") && name != "Focus node") { return !document_.nodes().isEmpty(); }
 if (!quickAddNodeType(name).isEmpty()) { return !readOnly() && knownNodeType(quickAddNodeType(name)); }
 if ((name == "Run" || name == "Stop") && inlineChild_ && childParent_) { return workflowHost()->menuActionEnabled(name); }
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

static void replaceSelection(CanvasSelection &selection, const WorkflowGraphModel &model, const QSet<QString> &ids) {
    QList<QtNodes::NodeId> nodes;
    for (const auto id : model.allNodeIds()) {
        if (ids.contains(model.resourceId(id))) { nodes.append(id); }
    }
    selection.selectNodes(nodes, true);
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
    replaceSelection(canvas_->selection(), model_, result);
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
    replaceSelection(canvas_->selection(), model_, same);
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
    const auto builder = std::make_shared<ContextMenuBuilder>(*this, nodeId, edgeId, scenePosition.isNull() ? canvas_->mapToScene(canvas_->viewportWidget().mapFromGlobal(globalPosition)) : scenePosition, globalPosition);
    MenuBuilder menu = kind == "pane" ? builder->pane() : kind == "selection" ? builder->selection() : kind == "edge" ? builder->edge() : kind == "link" ? builder->link() : builder->node();
    if (menu.entries().isEmpty()) {
        return;
    }
    EntryMenuRequest request;
    request.kind = kind;
    request.global = globalPosition;
    request.entries = menu.entries();
    request.actions = menu.actions();
    request.guardSelection = true;
    // The entry actions capture the builder, so the menu keeps it alive.
    request.keepAlive = builder;
    showEntryMenu(request);
}

// Shows entries in ContextMenuPanel.qml on a transparent overlay of this window,
// the same surface as the canvas context menus. Returns the overlay, or null
// when it could not be created.
QQuickWidget *EditorWindow::showEntryMenu(const EntryMenuRequest &menuRequest) {
    if (contextMenuHost_) {
        contextMenuHost_->hide();
        contextMenuHost_->deleteLater();
    }
    const auto request = std::make_shared<const EntryMenuRequest>(menuRequest);
    const auto epoch = documentEpoch_;
    const auto credentials = credentialsEpoch_;
    const auto selection = selectedIds();
    const QPointer<QWidget> prior = QApplication::focusWidget();
    auto *host = new QQuickWidget(engine_, this);
    contextMenuHost_ = host;
    host->setObjectName("context-menu-host");
    host->setProperty("menuKind", request->kind);
    host->setAttribute(Qt::WA_AlwaysStackOnTop);
    host->setAttribute(Qt::WA_TranslucentBackground);
    host->setClearColor(Qt::transparent);
    host->setResizeMode(QQuickWidget::SizeRootObjectToView);
    host->setGeometry(rect());
    auto *dispatch = new MenuDispatch(host);
    dispatch->invoke = [this, host, epoch, credentials, selection, prior, request](const QString &id) {
        if (!host->isVisible()) {
            return;
        }
        host->hide();
        host->deleteLater();
        if (prior) {
            prior->setFocus();
        }
        if (id.isEmpty()
            || (request->guardDocument && (epoch != documentEpoch_ || credentials != credentialsEpoch_))
            || (request->guardSelection && selection != selectedIds())) {
            return;
        }
        std::function<void()> run;
        if (request->choose) {
            run = [request, id] { request->choose(id); };
        } else if (const auto action = request->actions.value(id)) {
            run = action;
        }
        if (!run) {
            return;
        }
        if (request->deferChoice) {
            QTimer::singleShot(0, this, run);
        } else {
            run();
        }
    };
    if (request->guardDocument) {
        connect(this, &EditorWindow::documentEpochChanged, host, [dispatch] { dispatch->choose(""); });
        connect(this, &EditorWindow::credentialsEpochChanged, host, [dispatch] { dispatch->choose(""); });
    }
    host->setInitialProperties({{"dispatch", QVariant::fromValue(dispatch)}, {"entries", request->entries}});
    host->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/ContextMenuPanel.qml"));
    if (!host->rootObject()) {
        host->deleteLater();
        return nullptr;
    }
    host->show();
    host->raise();
    host->setFocus();
    const auto local = mapFromGlobal(request->global);
    QMetaObject::invokeMethod(host->rootObject(), "popupAt", Q_ARG(QVariant, local.x()), Q_ARG(QVariant, local.y()));
    return host;
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
        const auto target = canvas_->nodeRect(*found).center();
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
        if (canvas_) {
            canvas_->setFocus();
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

void EditorWindow::toggleNodeInfo() {
    if (!tabOwner_) {
        if (activeEditor_) { activeEditor_->toggleNodeInfo(); }
        return;
    }
    // NodeEditor.tsx toggles the panel for the first selected node: the same
    // node hides it, another node moves it there.
    const auto ids = selectedIds();
    if (ids.isEmpty()) { return; }
    nodeInfoId_ = nodeInfoId_ == ids.first() ? QString() : ids.first();
    syncNodeInfo();
}

void EditorWindow::closeNodeInfo() {
    if (nodeInfoId_.isEmpty()) { return; }
    nodeInfoId_.clear();
    syncNodeInfo();
    if (canvas_) { canvas_->setFocus(); }
}

void EditorWindow::syncNodeInfo() {
    if (!nodeInfoOverlay_) { return; }
    std::optional<QtNodes::NodeId> found;
    for (const auto id : model_.allNodeIds()) {
        if (!nodeInfoId_.isEmpty() && model_.resourceId(id) == nodeInfoId_) { found = id; }
    }
    // A deleted node closes the panel, as NodeInfoPanel.tsx does.
    if (!found) {
        nodeInfoId_.clear();
        nodeInfoOverlay_->hide();
        nodeInfo_.clear();
        return;
    }
    const auto metadata = model_.metadata(*found);
    const auto type = document_.node(nodeInfoId_)["type"].toString();
    nodeInfo_.setNode(nodeInfoId_, metadata["title"].toString(model_.layout(*found).title),
                      metadata["namespace"].toString(type.section('.', 0, -2)), metadata["description"].toString(),
                      model_.runtimeState(*found)["error"].toString());
    positionNodeInfo();
}

// NodeInfoPanel.tsx places the 320 px panel 16 px right of the node's top
// edge, or left of the node when the right side has no room, 16 px inside the
// canvas, and gives it at least 200 px of height.
void EditorWindow::positionNodeInfo() {
    if (!nodeInfoOverlay_ || nodeInfoId_.isEmpty() || !canvas_) { return; }
    QRectF bounds;
    for (const auto id : model_.allNodeIds()) {
        if (model_.resourceId(id) == nodeInfoId_) {
            bounds = canvas_->nodeRect(id);
        }
    }
    if (bounds.isEmpty()) {
        nodeInfoOverlay_->hide();
        return;
    }
    constexpr int gap = 16;
    constexpr int margin = 16;
    constexpr int minimumHeight = 200;
    const auto card = canvas_->mapFromScene(bounds).translated(canvas_->viewportWidget().pos());
    const auto area = canvas_->hostWidget().rect();
    const int width = nodeInfoOverlay_->width();
    int left = card.right() + gap;
    if (left + width + margin > area.width()) { left = card.left() - gap - width; }
    left = std::clamp(left, margin, std::max(margin, area.width() - width - margin));
    const int top = std::clamp(card.top(), margin, std::max(margin, area.height() - minimumHeight - margin));
    nodeInfo_.setMaximumHeight(area.height() - top - margin);
    nodeInfoOverlay_->move(left, top);
    nodeInfoOverlay_->show();
}

void EditorWindow::openNodeMenuAt(const QStringList &path, const QString &term) {
    if (!tabOwner_) {
        if (activeEditor_) { activeEditor_->openNodeMenuAt(path, term); }
        return;
    }
    openNodeMenu();
    if (nodeMenu_ && nodeMenu_->rootObject()) {
        QMetaObject::invokeMethod(nodeMenu_->rootObject(), "showPath", Q_ARG(QVariant, QVariant(path)), Q_ARG(QVariant, QVariant(term)));
    }
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

void EditorWindow::toggleCommandMenu() {
    if (!tabOwner_) {
        if (activeEditor_) {
            activeEditor_->toggleCommandMenu();
        }
        return;
    }
    auto *owner = tabOwner_;
    if (owner->commandPanel_) {
        if (auto *root = owner->commandPanel_->rootObject()) {
            if (auto *controller = qvariant_cast<QObject *>(root->property("controller"))) {
                QMetaObject::invokeMethod(controller, "close");
                return;
            }
        }
        owner->commandPanel_->hide();
        owner->commandPanel_->deleteLater();
        return;
    }
    if (contextMenuHost_) {
        contextMenuHost_->hide();
        contextMenuHost_->deleteLater();
    }

    const auto epoch = documentEpoch_;
    const auto credentials = credentialsEpoch_;
    const auto selection = selectedIds();
    const QPointer<QWidget> prior = QApplication::focusWidget();
    const QPointer<EditorWindow> editor(this);
    const QPointer<EditorWindow> hostOwner(owner);

    // Collect native shortcut keycaps from the canonical table, keeping alternate bindings.
    QHash<QString, QStringList> shortcutMap;
    for (const auto &entry : shortcuts) {
        const auto name = QString::fromLatin1(entry.command);
        const auto text = QKeySequence(QString::fromLatin1(entry.keys)).toString(QKeySequence::NativeText);
        if (!shortcutMap[name].contains(text)) {
            shortcutMap[name].append(text);
        }
    }
    const auto keysFor = [&](const QString &name, const QStringList &fallback = {}) {
        const auto found = shortcutMap.value(name);
        if (!found.isEmpty()) {
            return found;
        }
        QStringList rendered;
        for (const auto &seq : fallback) {
            rendered.append(QKeySequence(seq).toString(QKeySequence::NativeText));
        }
        return rendered;
    };

    std::vector<CommandMenuController::Entry> entries;
    QSet<QString> usedLabels;
    const auto uniqueLabel = [&](const QString &base) {
        if (!usedLabels.contains(base)) {
            usedLabels.insert(base);
            return base;
        }
        int suffix = 2;
        while (usedLabels.contains(QStringLiteral("%1 (%2)").arg(base).arg(suffix))) {
            ++suffix;
        }
        const auto candidate = QStringLiteral("%1 (%2)").arg(base).arg(suffix);
        usedLabels.insert(candidate);
        return candidate;
    };

    const auto addAction = [&](const QString &label,
                               const QString &section,
                               const QString &icon,
                               const QStringList &keywords = {},
                               const QStringList &fallbackKeys = {},
                               const QString &actionName = {}) {
        const QString target = actionName.isEmpty() ? label : actionName;
        entries.push_back({
            .id = QStringLiteral("action:%1").arg(target),
            .label = uniqueLabel(label),
            .section = section,
            .icon = icon,
            .shortcuts = keysFor(target, fallbackKeys),
            .keywords = keywords,
            .available = menuActionEnabled(target),
            .guardDocument = true,
            .run = [editor, target] {
                if (editor && editor->menuActionEnabled(target)) {
                    editor->userAction(target);
                }
            }
        });
    };

    const auto addCustom = [&](const QString &id,
                               const QString &label,
                               const QString &section,
                               const QString &icon,
                               const QStringList &keywords,
                               const QStringList &fallbackKeys,
                               bool available,
                               bool guardDocument,
                               std::function<void()> run) {
        entries.push_back({
            .id = id,
            .label = uniqueLabel(label),
            .section = section,
            .icon = icon,
            .shortcuts = keysFor(label, fallbackKeys),
            .keywords = keywords,
            .available = available,
            .guardDocument = guardDocument,
            .run = std::move(run)
        });
    };

    // 1. Open tabs (GlobalCommandGroups.tsx SwitchTabCommands).
    const auto tabs = owner->workflowTabs();
    const int currentTab = owner->activeTab();
    if (tabs.size() > 1) {
        for (int index = 0; index < tabs.size(); ++index) {
            if (index == currentTab) {
                continue;
            }
            const auto tab = tabs.at(index).toMap();
            const auto title = tab.value(QStringLiteral("title")).toString();
            const auto kind = tab.value(QStringLiteral("kind")).toString();
            const QString icon = kind == QStringLiteral("storyboard") ? QStringLiteral("viewCarouselOutlined")
                : kind == QStringLiteral("script") ? QStringLiteral("descriptionOutlined")
                : QStringLiteral("accountTree");
            addCustom(
                QStringLiteral("tab:%1").arg(index),
                title.isEmpty() ? tr("Untitled workflow") : title,
                tr("Open tabs"),
                icon,
                {QStringLiteral("tab"), QStringLiteral("switch"), QStringLiteral("go to"), kind},
                {},
                true,
                false,
                [hostOwner, index] {
                    if (hostOwner) {
                        hostOwner->activateTab(index);
                    }
                });
        }
    }

    // 2. Workflow (CommandMenu.tsx WorkflowCommands + native workflow actions).
    const QString wf = tr("Workflow");
    addAction(QStringLiteral("Run"), wf, QStringLiteral("playArrow"),
              {QStringLiteral("run entire workflow"), QStringLiteral("execute"), QStringLiteral("start")});
    addAction(QStringLiteral("Run selected"), wf, QStringLiteral("playArrow"),
              {QStringLiteral("partial"), QStringLiteral("selection")});
    addAction(QStringLiteral("Stop"), wf, QStringLiteral("stop"),
              {QStringLiteral("cancel workflow"), QStringLiteral("abort")});
    addAction(QStringLiteral("Save"), wf, QStringLiteral("saveOutlined"),
              {QStringLiteral("save workflow")});
    addAction(QStringLiteral("Save local copy as"), wf, QStringLiteral("fileDownload"),
              {QStringLiteral("save as"), QStringLiteral("download workflow json"), QStringLiteral("export")},
              {QStringLiteral("Ctrl+Shift+S")});
    addCustom(QStringLiteral("workflow:new"), tr("New workflow"), wf, QStringLiteral("add"),
              {QStringLiteral("create"), QStringLiteral("new tab")}, {QStringLiteral("Ctrl+T")}, true, false,
              [hostOwner] { if (hostOwner) { hostOwner->newTab(); } });
    addCustom(QStringLiteral("workflow:new-comfy"), tr("New Comfy workflow"), wf, QStringLiteral("add"),
              {QStringLiteral("create"), QStringLiteral("comfyui")}, {}, true, false,
              [hostOwner] { if (hostOwner) { hostOwner->newComfyWorkflow(); } });
    addCustom(QStringLiteral("workflow:close"), tr("Close workflow"), wf, QStringLiteral("closeOutlined"),
              {QStringLiteral("close tab")}, {QStringLiteral("Ctrl+W")}, true, false,
              [hostOwner] { if (hostOwner) { hostOwner->closeTab(hostOwner->activeTab()); } });
    addAction(QStringLiteral("Open file"), wf, QStringLiteral("folderOutlined"),
              {QStringLiteral("import workflow json"), QStringLiteral("open local")}, {QStringLiteral("Ctrl+O")});
    addCustom(QStringLiteral("workflow:copy-json"), tr("Copy workflow JSON"), wf, QStringLiteral("copy"),
              {QStringLiteral("clipboard"), QStringLiteral("export"), QStringLiteral("json")}, {}, true, true,
              [editor] {
                  if (!editor) { return; }
                  QApplication::clipboard()->setText(QString::fromUtf8(
                      QJsonDocument(editor->document_.snapshot()).toJson(QJsonDocument::Indented)));
                  editor->notify(QStringLiteral("info"), tr("Copied workflow JSON to clipboard."));
              });
    addAction(QStringLiteral("Auto layout"), wf, QStringLiteral("autoFixHigh"),
              {QStringLiteral("arrange"), QStringLiteral("organize")});
    addAction(instantUpdate_ ? QStringLiteral("Instant Update: On") : QStringLiteral("Instant Update: Off"),
              wf, QStringLiteral("autoFixHigh"),
              {QStringLiteral("instant update"), QStringLiteral("live preview"), QStringLiteral("auto run")});
    addAction(QStringLiteral("Server Open"), wf, QStringLiteral("folderOutlined"),
              {QStringLiteral("open from server"), QStringLiteral("workflows")});
    addAction(QStringLiteral("Server Save"), wf, QStringLiteral("saveOutlined"),
              {QStringLiteral("save to server")});
    addAction(QStringLiteral("Server sync"), wf, QStringLiteral("sync"),
              {QStringLiteral("sync"), QStringLiteral("conflict")});
    addAction(QStringLiteral("Share"), wf, QStringLiteral("link"),
              {QStringLiteral("share workflow")});
    addAction(QStringLiteral("Publish to cloud"), wf, QStringLiteral("fileUpload"),
              {QStringLiteral("cloud"), QStringLiteral("publish")});
    addAction(QStringLiteral("Synchronize"), wf, QStringLiteral("sync"),
              {QStringLiteral("cloud"), QStringLiteral("sync")});
    addAction(QStringLiteral("Connect"), wf, QStringLiteral("link"),
              {QStringLiteral("server"), QStringLiteral("url")});
    addAction(QStringLiteral("Reconnect"), wf, QStringLiteral("refresh"),
              {QStringLiteral("server")});
    addAction(QStringLiteral("Version history"), wf, QStringLiteral("history"),
              {QStringLiteral("versions"), QStringLiteral("checkpoints")});
    addAction(QStringLiteral("Workflow metadata"), wf, QStringLiteral("info"),
              {QStringLiteral("workflow settings"), QStringLiteral("name"), QStringLiteral("description")});
    addAction(QStringLiteral("Linked workflows"), wf, QStringLiteral("accountTree"),
              {QStringLiteral("subgraphs"), QStringLiteral("references")});
    addAction(QStringLiteral("Canvas uploads"), wf, QStringLiteral("fileUpload"),
              {QStringLiteral("uploads"), QStringLiteral("drops")});
    addAction(QStringLiteral("Run trace"), wf, QStringLiteral("timeline"),
              {QStringLiteral("trace"), QStringLiteral("spans"), QStringLiteral("logs")});
    addAction(QStringLiteral("Examples"), wf, QStringLiteral("exploreOutlined"),
              {QStringLiteral("templates"), QStringLiteral("samples")});

    // 3. Edit (CommandMenu.tsx EditCommands + native node editing commands).
    const QString edit = tr("Edit");
    addAction(QStringLiteral("Undo"), edit, QStringLiteral("undo"));
    addAction(QStringLiteral("Redo"), edit, QStringLiteral("redo"));
    addAction(QStringLiteral("Copy"), edit, QStringLiteral("copy"));
    addAction(QStringLiteral("Cut"), edit, QStringLiteral("contentCut"));
    addAction(QStringLiteral("Paste"), edit, QStringLiteral("contentPaste"));
    addAction(QStringLiteral("Select all"), edit, QStringLiteral("selectAll"));
    addAction(QStringLiteral("Delete"), edit, QStringLiteral("deleteOutline"),
              {QStringLiteral("delete selected"), QStringLiteral("remove")});
    addAction(QStringLiteral("Duplicate"), edit, QStringLiteral("queue"),
              {QStringLiteral("clone")});
    addAction(QStringLiteral("Duplicate vertical"), edit, QStringLiteral("south"),
              {QStringLiteral("duplicate vertically")});
    addAction(QStringLiteral("Group selection"), edit, QStringLiteral("groupWork"),
              {QStringLiteral("group selected"), QStringLiteral("surround")});
    addAction(QStringLiteral("Group into subgraph"), edit, QStringLiteral("schema"),
              {QStringLiteral("subgraph"), QStringLiteral("extract")});
    addAction(QStringLiteral("Open child"), edit, QStringLiteral("openInNew"),
              {QStringLiteral("open subgraph")});
    addAction(QStringLiteral("Ungroup"), edit, QStringLiteral("groupRemove"));
    addAction(QStringLiteral("Remove from group"), edit, QStringLiteral("groupRemove"),
              {QStringLiteral("detach")});
    addAction(QStringLiteral("Disable toggle"), edit, QStringLiteral("block"),
              {QStringLiteral("bypass"), QStringLiteral("disable selected nodes"), QStringLiteral("enable")});
    addAction(QStringLiteral("Disable selected"), edit, QStringLiteral("block"),
              {QStringLiteral("bypass"), QStringLiteral("disable selected nodes")});
    addAction(QStringLiteral("Enable selected"), edit, QStringLiteral("power"),
              {QStringLiteral("unbypass")});
    addAction(QStringLiteral("Toggle collapse"), edit, QStringLiteral("unfoldLess"),
              {QStringLiteral("collapse"), QStringLiteral("expand")});
    addAction(QStringLiteral("Find node"), edit, QStringLiteral("search"),
              {QStringLiteral("find in workflow"), QStringLiteral("search")});
    addAction(QStringLiteral("Add node"), edit, QStringLiteral("addCircle"),
              {QStringLiteral("node menu"), QStringLiteral("insert")});
    addAction(QStringLiteral("Add comment"), edit, QStringLiteral("addComment"),
              {QStringLiteral("note")});
    addAction(QStringLiteral("Edit note"), edit, QStringLiteral("editNote"),
              {QStringLiteral("comment")});
    addAction(QStringLiteral("Rename node"), edit, QStringLiteral("rename"));
    addAction(QStringLiteral("Rename group"), edit, QStringLiteral("rename"));
    addAction(QStringLiteral("Edit comment"), edit, QStringLiteral("editOutlined"));
    addAction(QStringLiteral("Link selected"), edit, QStringLiteral("link"),
              {QStringLiteral("lineage")});
    addAction(QStringLiteral("Node info"), edit, QStringLiteral("info"),
              {QStringLiteral("documentation"), QStringLiteral("help")});
    addAction(QStringLiteral("Select all connected"), edit, QStringLiteral("callSplit"),
              {QStringLiteral("connected")});
    addAction(QStringLiteral("Select inputs"), edit, QStringLiteral("arrowBack"),
              {QStringLiteral("upstream")});
    addAction(QStringLiteral("Select outputs"), edit, QStringLiteral("arrowForward"),
              {QStringLiteral("downstream")});
    addAction(QStringLiteral("Add Prompt"), edit, QStringLiteral("add"),
              {QStringLiteral("quick add")});
    addAction(QStringLiteral("Add Text to Image"), edit, QStringLiteral("image"),
              {QStringLiteral("quick add")});
    addAction(QStringLiteral("Add Text to Video"), edit, QStringLiteral("movie"),
              {QStringLiteral("quick add")});
    addAction(QStringLiteral("Add Agent"), edit, QStringLiteral("smartToy"),
              {QStringLiteral("quick add")});

    // 4. Layout & Alignment (CommandMenu.tsx LayoutCommands).
    const QString layoutSection = tr("Layout & Alignment");
    addAction(QStringLiteral("Align"), layoutSection, QStringLiteral("formatAlignLeft"),
              {QStringLiteral("align nodes")});
    addAction(QStringLiteral("Align with spacing"), layoutSection, QStringLiteral("linearScale"),
              {QStringLiteral("align nodes with spacing"), QStringLiteral("arrange")});
    addAction(QStringLiteral("Align left"), layoutSection, QStringLiteral("alignHorizontalLeft"));
    addAction(QStringLiteral("Align center"), layoutSection, QStringLiteral("alignHorizontalCenter"));
    addAction(QStringLiteral("Align right"), layoutSection, QStringLiteral("alignHorizontalRight"));
    addAction(QStringLiteral("Align top"), layoutSection, QStringLiteral("verticalAlignTop"));
    addAction(QStringLiteral("Align middle"), layoutSection, QStringLiteral("verticalAlignCenter"));
    addAction(QStringLiteral("Align bottom"), layoutSection, QStringLiteral("verticalAlignBottom"));
    addAction(QStringLiteral("Distribute horizontally"), layoutSection, QStringLiteral("viewColumn"));
    addAction(QStringLiteral("Stack selection"), layoutSection, QStringLiteral("layers"));
    addAction(QStringLiteral("Arrange grid"), layoutSection, QStringLiteral("all"));
    addAction(QStringLiteral("Layout selection"), layoutSection, QStringLiteral("autoFixHigh"));

    // 5. View (CommandMenu.tsx ViewCommands + native viewport/focus navigation).
    const QString viewSection = tr("View");
    addAction(QStringLiteral("Toggle mini-map"), viewSection, QStringLiteral("map"),
              {QStringLiteral("show mini map"), QStringLiteral("hide mini map"), QStringLiteral("minimap")});
    addAction(QStringLiteral("Fit"), viewSection, QStringLiteral("fitScreen"),
              {QStringLiteral("fit view"), QStringLiteral("fit screen")});
    addAction(QStringLiteral("Fit selection"), viewSection, QStringLiteral("filterCenterFocus"));
    addAction(QStringLiteral("Zoom in"), viewSection, QStringLiteral("zoomIn"));
    addAction(QStringLiteral("Zoom out"), viewSection, QStringLiteral("zoomOut"));
    addAction(QStringLiteral("Reset zoom"), viewSection, QStringLiteral("restartAlt"));
    addAction(QStringLiteral("Zoom to 50%"), viewSection, QStringLiteral("zoomOut"));
    addAction(QStringLiteral("Zoom to 100%"), viewSection, QStringLiteral("zoomIn"));
    addAction(QStringLiteral("Zoom to 200%"), viewSection, QStringLiteral("zoomIn"));
    addAction(QStringLiteral("Zoom presets"), viewSection, QStringLiteral("zoomIn"));
    addAction(QStringLiteral("Focus node"), viewSection, QStringLiteral("centerFocusStrong"));
    addAction(QStringLiteral("Focus next node"), viewSection, QStringLiteral("myLocation"));
    addAction(QStringLiteral("Focus previous node"), viewSection, QStringLiteral("myLocation"));
    addAction(QStringLiteral("Focus node above"), viewSection, QStringLiteral("myLocation"));
    addAction(QStringLiteral("Focus node below"), viewSection, QStringLiteral("myLocation"));
    addAction(QStringLiteral("Focus node left"), viewSection, QStringLiteral("myLocation"));
    addAction(QStringLiteral("Focus node right"), viewSection, QStringLiteral("myLocation"));
    addAction(QStringLiteral("Focus back"), viewSection, QStringLiteral("myLocation"));
    addAction(QStringLiteral("Select focused node"), viewSection, QStringLiteral("centerFocusStrong"));
    addAction(QStringLiteral("Move left"), viewSection, QStringLiteral("swapHoriz"));
    addAction(QStringLiteral("Move right"), viewSection, QStringLiteral("swapHoriz"));
    addAction(QStringLiteral("Move up"), viewSection, QStringLiteral("swapHoriz"));
    addAction(QStringLiteral("Move down"), viewSection, QStringLiteral("swapHoriz"));
    addCustom(QStringLiteral("view:fullscreen"), tr("Toggle full screen"), viewSection, QStringLiteral("fullscreen"),
              {QStringLiteral("fullscreen")}, {QKeySequence(QKeySequence::FullScreen).toString()}, true, false,
              [hostOwner] {
                  if (!hostOwner) { return; }
                  if (hostOwner->isFullScreen()) { hostOwner->showNormal(); }
                  else { hostOwner->showFullScreen(); }
              });

    // 6. Panels (CommandMenu.tsx PanelCommands + native docks).
    const QString panelsSection = tr("Panels");
    addAction(QStringLiteral("Toggle inspector"), panelsSection, QStringLiteral("tune"),
              {QStringLiteral("properties"), QStringLiteral("right panel")});
    addAction(QStringLiteral("Toggle nodes"), panelsSection, QStringLiteral("panelLeft"),
              {QStringLiteral("catalog"), QStringLiteral("library"), QStringLiteral("nodes panel")});
    addAction(QStringLiteral("Workflows"), panelsSection, QStringLiteral("accountTree"),
              {QStringLiteral("toggle workflows panel")});
    addCustom(QStringLiteral("panel:chat"), tr("Toggle chat"), panelsSection, QStringLiteral("forumOutlined"),
              {QStringLiteral("toggle conversation"), QStringLiteral("assistant"), QStringLiteral("ai")},
              {}, true, false,
              [hostOwner] { if (hostOwner) { hostOwner->toggleChat(); } });
    addAction(QStringLiteral("Library"), panelsSection, QStringLiteral("collectionsOutlined"),
              {QStringLiteral("toggle assets"), QStringLiteral("media")});
    addAction(QStringLiteral("Files"), panelsSection, QStringLiteral("folderOutlined"),
              {QStringLiteral("project files")});
    addAction(QStringLiteral("Output"), panelsSection, QStringLiteral("playlistPlay"),
              {QStringLiteral("run output"), QStringLiteral("logs")});
    addAction(QStringLiteral("Queue"), panelsSection, QStringLiteral("schedule"),
              {QStringLiteral("jobs")});
    addAction(QStringLiteral("Settings"), panelsSection, QStringLiteral("settings"),
              {QStringLiteral("preferences")});

    // 7. Projects (GlobalCommandGroups.tsx ProjectCommands).
    const QString currentProject = owner->activeProject();
    if (!currentProject.isEmpty() || !owner->projects_.isEmpty()) {
        const QString projectsSection = tr("Projects");
        if (!currentProject.isEmpty()) {
            addCustom(QStringLiteral("project:personal"), tr("Personal"), projectsSection, QStringLiteral("toolProjects"),
                      {QStringLiteral("switch to project"), QStringLiteral("project")}, {}, true, false,
                      [hostOwner] { if (hostOwner) { hostOwner->selectProject({}); } });
        }
        for (const auto &value : owner->projects_) {
            const auto row = value.toObject();
            const auto id = row.value(QStringLiteral("id")).toString();
            const auto name = row.value(QStringLiteral("name")).toString();
            if (id.isEmpty() || id == currentProject || name.isEmpty()) {
                continue;
            }
            addCustom(QStringLiteral("project:%1").arg(id), name, projectsSection, QStringLiteral("toolProjects"),
                      {QStringLiteral("switch to project"), QStringLiteral("project")}, {}, true, false,
                      [hostOwner, id] { if (hostOwner) { hostOwner->selectProject(id); } });
        }
    }

    // 8. Help (GlobalCommandGroups.tsx HelpCommands).
    const QString helpSection = tr("Help");
    addAction(QStringLiteral("Keyboard shortcuts"), helpSection, QStringLiteral("keyboard"),
              {QStringLiteral("hotkeys"), QStringLiteral("keybindings"), QStringLiteral("help")});
    addCustom(QStringLiteral("help:report-bug"), tr("Report bug"), helpSection, QStringLiteral("reportProblem"),
              {QStringLiteral("issue"), QStringLiteral("feedback")}, {}, true, false,
              [editor] { if (editor) { editor->reportBug({}); } });

    // Host directly on the root EditorWindow as a full-window overlay so Qt Quick
    // keeps active keyboard focus reliably across macOS/Windows/Linux without popup
    // window activation bugs, and draws the full-window modal scrim like the web dialog.
    // Parented to owner, which destroys it on close or shutdown.
    auto *host = new QQuickWidget(engine_, owner);
    owner->commandPanel_ = host;
    host->setObjectName(QStringLiteral("command-panel"));
    host->setAttribute(Qt::WA_AlwaysStackOnTop);
    host->setAttribute(Qt::WA_TranslucentBackground);
    host->setClearColor(Qt::transparent);
    host->setFocusPolicy(Qt::StrongFocus);
    host->setResizeMode(QQuickWidget::SizeRootObjectToView);
    host->setGeometry(owner->rect());

    // Parented to host so it outlives the QML root during teardown.
    auto *controller = new CommandMenuController(host);
    controller->setEntries(std::move(entries));
    // Parented to host; keeps host sized to owner on window resize.
    new CommandPanelFilter(host, owner);

    const QPointer<QQuickWidget> guardedHost(host);
    const auto dismiss = [guardedHost, hostOwner, editor, prior] {
        if (!guardedHost || !guardedHost->isVisible()) {
            return false;
        }
        if (hostOwner && hostOwner->commandPanel_ == guardedHost) {
            hostOwner->commandPanel_.clear();
        }
        guardedHost->hide();
        guardedHost->deleteLater();
        if (prior && prior != guardedHost && !guardedHost->isAncestorOf(prior) && prior->isVisible()) {
            prior->setFocus(Qt::OtherFocusReason);
        } else if (editor && editor->canvas_) {
            editor->canvas_->setFocus(Qt::OtherFocusReason);
        }
        return true;
    };

    controller->onClose = [dismiss] { dismiss(); };
    controller->onActivate = [dismiss, editor, hostOwner, epoch, credentials, selection](const CommandMenuController::Entry &entry) {
        auto run = entry.run;
        const bool guardDocument = entry.guardDocument;
        if (!dismiss()) {
            return;
        }
        if (guardDocument) {
            if (!editor || epoch != editor->documentEpoch_ || credentials != editor->credentialsEpoch_ || selection != editor->selectedIds()) {
                return;
            }
        } else if (!hostOwner) {
            return;
        }
        if (run) {
            run();
        }
    };

    connect(this, &EditorWindow::documentEpochChanged, host, [controller] { controller->close(); });
    connect(this, &EditorWindow::credentialsEpochChanged, host, [controller] { controller->close(); });
    connect(this, &QObject::destroyed, host, [controller] { controller->close(); });

    host->setInitialProperties({{QStringLiteral("controller"), QVariant::fromValue(controller)}});
    host->setSource(QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/NodeEditor/CommandMenu.qml")));
    if (!host->rootObject()) {
        if (owner->commandPanel_ == host) {
            owner->commandPanel_.clear();
        }
        host->deleteLater();
        return;
    }

    host->show();
    host->raise();
    host->setFocus(Qt::PopupFocusReason);
    QMetaObject::invokeMethod(host->rootObject(), "activate");
    // Re-assert focus on the next event-loop turn so opening via a toolbar click or
    // menu dismissal never steals focus back from the search field.
    QTimer::singleShot(0, host, [guardedHost] {
        if (guardedHost && guardedHost->isVisible()) {
            guardedHost->setFocus(Qt::PopupFocusReason);
            if (auto *root = guardedHost->rootObject()) {
                QMetaObject::invokeMethod(root, "activate");
            }
        }
    });
}

void EditorWindow::showActionMenu(const QString &kind, const QPoint &position) {
 if (kind == "pane" || kind == "node" || kind == "group" || kind == "selection") {
  showContextMenu(kind == "group" ? QString("node") : kind, position, kind == "pane" || kind == "selection" ? QString() : selectedIds().value(0));
  return;
 }
 if (kind == "command") {
  toggleCommandMenu();
  return;
 }
 const auto epoch = documentEpoch_, credentials = credentialsEpoch_;
 const auto selection = selectedIds();
 if (kind == "shortcuts") {
  auto *panel = new ShortcutsDialog(this);
  panel->setObjectName(QStringLiteral("shortcuts-panel"));
  const QPointer<QWidget> prior = QApplication::focusWidget();
  connect(panel, &QDialog::finished, this, [prior] {
   if (prior && prior->isVisible()) { prior->setFocus(Qt::OtherFocusReason); }
  });
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
  names.removeDuplicates();
  const auto group = [](const QString &name) {
   if (name.startsWith("Align") || name.startsWith("Distribute") || name == "Stack selection" || name == "Arrange grid") { return QString("Layout & Alignment"); }
   if (name == "Output" || name == "Toggle nodes" || name == "Toggle inspector" || name == "Workflows") { return QString("Panels"); }
   if (name.startsWith("Move") || name.startsWith("Fit") || name.startsWith("Focus") || name.startsWith("Zoom") || name.startsWith("Toggle") || name == "Workflows") { return QString("View"); }
   if (name == "Run" || name == "Stop" || name == "Save" || name == "Examples" || name.startsWith("Open")) { return QString("Workflow"); }
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
  panel->quick = quick;
  quick->setResizeMode(QQuickWidget::SizeRootObjectToView);
  quick->setAttribute(Qt::WA_TranslucentBackground);
  quick->setClearColor(Qt::transparent);
  const bool german = QLocale().name().startsWith("de");
#ifdef Q_OS_MACOS
  const QString platform = "mac";
#else
  const QString platform = "win";
#endif
  quick->setInitialProperties({{"dispatch", QVariant::fromValue(dispatch)}, {"rows", rows}, {"help", true}, {"os", platform}, {"layoutName", german ? "german" : "english"}});
  quick->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/ActionPanel.qml"));
  auto *layout = new QVBoxLayout(panel); layout->setContentsMargins(0,0,0,0); layout->addWidget(quick);
  const QSize wanted(880, 760);
  panel->resize(wanted.boundedTo(size() - QSize(32, 32)));
  panel->move(mapToGlobal(rect().center()) - QPoint(panel->width() / 2, panel->height() / 2));
  panel->show(); quick->setFocus(Qt::PopupFocusReason);
  QMetaObject::invokeMethod(quick->rootObject(), "activate");
  return;
 }
 {
  QStringList names;
  // The document's own settings and views. The node, layout, run and server
  // commands are in the Node and Workflow menus of the application menu.
  if (kind == "more") { names = {instantUpdate_ ? "Instant Update: On" : "Instant Update: Off", "Workflow metadata", "Server sync", "Canvas uploads", "Command menu"}; }
#ifndef Q_OS_MACOS
  if (kind == "more") { names.insert(1, mouseNavigation() ? "Canvas navigation: Mouse" : "Canvas navigation: Trackpad"); }
#endif
  if (names.isEmpty()) { return; }
  EntryMenuRequest request;
  request.kind = kind;
  request.global = position;
  request.guardSelection = true;
  for (const auto &name : names) {
   request.entries.append(QVariantMap{{"id", name}, {"label", name}, {"enabled", menuActionEnabled(name)}});
  }
  request.choose = [this, epoch, credentials, selection](const QString &name) {
   if (epoch != documentEpoch_ || credentials != credentialsEpoch_ || selection != selectedIds() || !menuActionEnabled(name)) { return; }
   userAction(name);
  };
  showEntryMenu(request);
 }
}
}

#include "EditorMenus.moc"
