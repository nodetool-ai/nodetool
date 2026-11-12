#include "EditorWindow.h"
#include <QGraphicsView>
#include <QJsonDocument>
#include <QtQml/QQmlExtensionPlugin>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWidget>
#include <QUuid>
#include <QSettings>

Q_IMPORT_QML_PLUGIN(NodeTool_ChatPlugin)
Q_IMPORT_QML_PLUGIN(NodeTool_ModelPickerPlugin)
Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)

namespace nodetool {
nt::chat::ChatSession *EditorWindow::chatSession() {
    return activeEditor() == this ? &chat_ : activeEditor()->chatSession();
}

void EditorWindow::initializeChat() {
    QSettings settings;
    chatOffset_ = settings.value("canvas-chat-dock/position", QPoint()).toPoint();
    chatSize_ = settings.value("canvas-chat-dock/size", QSize(420, 2000)).toSize();
    chatVisible_ = !settings.value("canvas-chat-dock/collapsed", true).toBool();
    chatOverlay_ = new QQuickWidget(engine_, view_);
    chatOverlay_->setClearColor(Qt::transparent);
    chatOverlay_->setAttribute(Qt::WA_TranslucentBackground);
    chatOverlay_->setObjectName("editor-chat-overlay");
    chatOverlay_->setResizeMode(QQuickWidget::SizeRootObjectToView);
    chatOverlay_->setInitialProperties({{"session", QVariant::fromValue(&chat_)}, {"host", QVariant::fromValue(this)}});
    chatOverlay_->setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/EditorChat.qml"));
    chatOverlay_->hide();
    connect(chatOverlay_->rootObject(), SIGNAL(closeRequested()), this, SLOT(toggleChat()));
    initializeChatTools();
    connect(this, &EditorWindow::panelChanged, this, &EditorWindow::syncChatContext);
    connect(this, &EditorWindow::tabsChanged, this, &EditorWindow::syncChatContext);
    connect(&session_, &node_editor::WorkflowSession::credentialsChanged, this,
            [this](const QUrl &origin, const QString &token, const QString &) {
        chat_.disconnectFromServer();
        chatOrigin_ = origin;
        chatToken_ = token;
        chatConnected_ = false;
        ensureChatConnected();
    });
    syncChatContext();
}

// Chat holds its own socket, so a tab connects it only once its panel opens.
void EditorWindow::ensureChatConnected() {
    if (!chatVisible_ || chatConnected_ || chatOrigin_.isEmpty()) {
        return;
    }
    chatConnected_ = true;
    chat_.connectToServer(chatOrigin_, chatToken_);
}

void EditorWindow::syncChatContext() {
    const auto workflow = document_.snapshot();
    chat_.setWorkflow(workflow["id"].toString());
    const auto ref = QJsonObject{{"type", "workflow"}, {"id", workflow["id"]}, {"title", workflow["name"]}};
    QJsonArray open;
    const auto owner = tabOwner_ ? tabOwner_ : this;
    for (const auto tab : owner->tabs_) {
        const auto item = tab->document_.snapshot();
        open.append(QJsonObject{{"type", "workflow"}, {"id", item["id"]}, {"title", item["name"]}});
    }
    const auto ids = selectedIds();
    const QJsonValue selection = ids.isEmpty() ? QJsonValue(QJsonValue::Null)
        : QJsonValue(QJsonObject{{"node_ids", QJsonArray::fromStringList(ids)}});
    QJsonObject ui{{"source", "workflow_canvas"}, {"focused", ref}, {"open", open}, {"selection", selection}};
    // Panel changes arrive in a later pass than askRunAgent. The run it attached
    // stays in the context while that run is still selected.
    const auto run = chat_.property("hostContext").toMap()["ui_context"].toMap()["run"].toMap();
    if (!run.isEmpty() && (run["run_id"].toString() == runOutput_.selectedRunId()
        || run["run_id"].toString() == runTrace_.selectedRunId())) {
        ui["run"] = QJsonObject::fromVariantMap(run);
    }
    chat_.setProperty("hostContext", QJsonObject{{"workflow_id", workflow["id"]}, {"ui_context", ui}}.toVariantMap());
}

void EditorWindow::toggleChat() {
    if (activeEditor() != this) {
        activeEditor()->toggleChat();
        return;
    }
    chatVisible_ = !chatVisible_;
    QSettings().setValue("canvas-chat-dock/collapsed", !chatVisible_);
    layoutOverlays();
    schedulePanelChanged();
}

void EditorWindow::askAgent(const QString &message) {
    if (activeEditor() != this) {
        activeEditor()->askAgent(message);
        return;
    }
    chatVisible_ = true;
    QSettings().setValue("canvas-chat-dock/collapsed", false);
    schedulePanelChanged();
    ensureChatConnected();
    if (chat_.selectedThreadId().isEmpty()) {
        chat_.createThread(message);
    } else {
        chat_.setDraft(message);
    }
    layoutOverlays();
}
void EditorWindow::askRunAgent(const QString &runId, const QString &spanId) {
    if (activeEditor() != this) {
        activeEditor()->askRunAgent(runId, spanId);
        return;
    }
    chatVisible_ = true;
    QSettings().setValue("canvas-chat-dock/collapsed", false);
    schedulePanelChanged();
    ensureChatConnected();
    syncChatContext();
    auto context = chat_.property("hostContext").toMap();
    auto ui = context["ui_context"].toMap();
    QVariantMap reference{{"run_id", runId}};
    if (!spanId.isEmpty()) { reference["span_id"] = spanId; }
    ui["run"] = reference;
    context["ui_context"] = ui;
    chat_.setProperty("hostContext", context);
    chat_.createThread(spanId.isEmpty() ? "Help me diagnose the selected run." : "Help me diagnose the selected span.");
    layoutOverlays();
}
void EditorWindow::layoutChat(const QSize &available) {
    if (!chatGeometryActive_) {
        QSettings settings;
        chatOffset_ = settings.value("canvas-chat-dock/position", chatOffset_).toPoint();
        chatSize_ = settings.value("canvas-chat-dock/size", chatSize_).toSize();
        // Until the user opens or closes it, the chat window starts open unless the
        // window is narrower than 1200 px (web stores/CanvasChatDockStore.ts).
        chatVisible_ = settings.contains("canvas-chat-dock/collapsed")
            ? !settings.value("canvas-chat-dock/collapsed").toBool()
            : window()->width() >= 1200;
    }
    const int width = std::min(std::clamp(chatSize_.width(), 320, 960), std::max(0, available.width() - 32));
    const int height = std::min(std::clamp(chatSize_.height(), 280, 2000), std::max(0, available.height() - 32));
    const int anchorX = available.width() - width - 16;
    const int x = std::clamp(anchorX + chatOffset_.x(), 8, std::max(8, available.width() - width - 8));
    const int y = std::clamp(16 + chatOffset_.y(), 8, std::max(8, available.height() - height - 8));
    chatOffset_ = QPoint(x - anchorX, y - 16);
    chatOverlay_->setGeometry(x, y, width, height);
    ensureChatConnected();
    if (!chatGeometryActive_ && isVisible()) {
        QSettings().setValue("canvas-chat-dock/position", chatOffset_);
    }
}
void EditorWindow::resetChatPosition() {
    QSettings().setValue("canvas-chat-dock/position", QPoint());
    layoutOverlays();
}
void EditorWindow::beginChatGeometry() {
    chatGeometryActive_ = true;
    chatGesture_ = chatOverlay_->geometry();
}
void EditorWindow::changeChatGeometry(int dx, int dy, int edges, bool finished) {
    auto rect = chatGesture_;
    if (edges == 0) {
        rect.translate(dx, dy);
    } else {
        if (edges & 1) {
            rect.setLeft(rect.right() - std::clamp(chatGesture_.width() - dx, 320, 960) + 1);
        }
        if (edges & 2) {
            rect.setHeight(std::clamp(chatGesture_.height() + dy, 280, 2000));
        }
        chatSize_ = rect.size();
    }
    chatOffset_ = QPoint(rect.x() - (view_->viewport()->width() - rect.width() - 16), rect.y() - 16);
    layoutOverlays();
    if (finished) {
        chatGeometryActive_ = false;
        QSettings settings;
        settings.setValue("canvas-chat-dock/position", chatOffset_);
        settings.setValue("canvas-chat-dock/size", chatSize_);
    }
}

}
