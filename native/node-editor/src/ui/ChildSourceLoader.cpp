#include "EditorWindow.h"
#include "document/ChildSources.h"
#include "graph/CardBodies.h"
#include "properties/ComfyWorkflowLoader.h"
#include <QDialog>
#include <QJsonDocument>
#include <QQuickItem>
#include <QQuickWidget>
#include <QVBoxLayout>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QUrlQuery>
#include <cmath>
#include <functional>

namespace nodetool {
namespace {
// One GET against the tab owner's server. done receives the parsed body, or an
// empty object when the request failed. The manager is parented to window and
// deletes itself with the reply, and the reply's handler runs on the UI thread
// with window as its context, so it never outlives the window.
void getJson(EditorWindow *window, const QUrl &url, const QString &token, std::function<void(QJsonObject)> done) {
    auto *network = new QNetworkAccessManager(window);
    QNetworkRequest request(url);
    request.setTransferTimeout(30000);
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    request.setRawHeader("Authorization", "Bearer " + token.toUtf8());
    auto *reply = network->get(request);
    QObject::connect(reply, &QNetworkReply::finished, window, [reply, network, done = std::move(done)] {
        const auto bytes = reply->readAll();
        const auto ok = reply->error() == QNetworkReply::NoError;
        network->deleteLater();
        done(ok ? QJsonDocument::fromJson(bytes).object() : QJsonObject{});
    });
}

QUrl trpcUrl(const QUrl &origin, const QString &procedure, const QJsonObject &input) {
    auto url = origin.resolved(QUrl(QStringLiteral("/trpc/") + procedure));
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("input"), QString::fromUtf8(QJsonDocument(input).toJson(QJsonDocument::Compact)));
    url.setQuery(query);
    return url;
}

QUrl workflowUrl(const QUrl &origin, const QString &id) {
    return origin.resolved(QUrl(QStringLiteral("/api/workflows/") + QString::fromLatin1(QUrl::toPercentEncoding(id))));
}
} // namespace

void EditorWindow::loadChildSource(const QString &nodeId, const QString &kind, const QString &sourceId) {
    if (!tabOwner_) {
        activeEditor_->loadChildSource(nodeId, kind, sourceId);
        return;
    }
    const auto node = document_.node(nodeId);
    const auto picker = childPicker(node["type"].toString());
    if (picker.property.isEmpty() || picker.kind != kind || sourceId.isEmpty() || readOnly()) { return; }
    const auto origin = tabOwner_->tabsOrigin_;
    const auto token = tabOwner_->tabsToken_;
    if (origin.isEmpty()) {
        notify(QStringLiteral("error"), tr("Connect to a server to choose a %1.").arg(kind));
        return;
    }
    const auto epoch = documentEpoch_;
    const auto credentials = credentialsEpoch_;
    const auto before = node["data"];
    // The node may change while the source loads. A stale answer is dropped.
    const auto current = [this, nodeId, epoch, credentials, before] {
        return epoch == documentEpoch_ && credentials == credentialsEpoch_ && document_.node(nodeId)["data"] == before;
    };
    const auto store = [this, nodeId, picker, sourceId](const QJsonObject &graph, const QJsonObject &snapshot, const QString &title) {
        const QJsonObject command{{"op", "batch"}, {"commands", QJsonArray{
            QJsonObject{{"op", "setProperty"}, {"id", nodeId}, {"name", picker.property}, {"value", sourceId}},
            QJsonObject{{"op", "setChildSnapshot"}, {"id", nodeId}, {"graph", graph}, {"snapshot", snapshot}}}}};
        const auto result = document_.applyCommand(command, title);
        if (!result) { notify(QStringLiteral("error"), result.error); }
    };
    if (kind == QStringLiteral("workflow")) {
        const auto host = document_.snapshot()["id"].toString();
        getJson(this, workflowUrl(origin, sourceId), token, [this, current, store, host, sourceId](const QJsonObject &workflow) {
            if (!current()) { return; }
            if (workflow["id"].toString() != sourceId || !workflow["graph"].isObject()) {
                notify(QStringLiteral("error"), tr("Failed to load workflow"));
                return;
            }
            // A workflow open in a tab answers with its live graph.
            const auto live = [this](const QString &id) {
                for (auto *tab : tabOwner_->tabs_) {
                    if (tab->document_.snapshot()["id"].toString() == id) { return tab->document_.snapshot()["graph"].toObject(); }
                }
                return QJsonObject{};
            };
            if (!host.isEmpty() && node_editor::createsWorkflowCycle(host, workflow, live)) {
                notify(QStringLiteral("error"), tr("\"%1\" runs this workflow, so it cannot run inside it.").arg(workflow["name"].toString()));
                return;
            }
            const auto graph = workflow["graph"].toObject();
            store(graph, QJsonObject{{"id", sourceId}, {"name", workflow["name"]}, {"graph", graph}}, tr("Select workflow"));
        });
        return;
    }
    const auto storedOperation = node["data"].toObject()["app_json"].toObject()["operation_id"].toString();
    getJson(this, trpcUrl(origin, QStringLiteral("applications.get"), {{"id", sourceId}}), token,
            [this, current, store, origin, token, storedOperation](const QJsonObject &body) {
        if (!current()) { return; }
        const auto application = body["result"].toObject()["data"].toObject();
        if (application.isEmpty()) {
            notify(QStringLiteral("error"), tr("This app could not be loaded."));
            return;
        }
        const auto document = node_editor::applicationDocument(application);
        if (document.isEmpty()) {
            notify(QStringLiteral("error"), tr("This app's document could not be read."));
            return;
        }
        const auto operation = node_editor::applicationOperation(document, storedOperation);
        if (operation.isEmpty()) {
            notify(QStringLiteral("error"), tr("This app has no workflow operation to run."));
            return;
        }
        const auto workflowId = operation["workflowId"].toString();
        getJson(this, workflowUrl(origin, workflowId), token,
                [this, current, store, application, document, operation, workflowId](const QJsonObject &workflow) {
            if (!current()) { return; }
            if (workflow["id"].toString() != workflowId || !workflow["graph"].isObject()) {
                notify(QStringLiteral("error"), tr("The workflow behind this app could not be loaded."));
                return;
            }
            const auto graph = workflow["graph"].toObject();
            store(graph, node_editor::applicationSnapshot(application, document, operation, graph), tr("Select app"));
        });
    });
}

void EditorWindow::showComfyWorkflowDialog(const QString &nodeId) {
    if (!tabOwner_) {
        activeEditor_->showComfyWorkflowDialog(nodeId);
        return;
    }
    if (readOnly() || !comfySchemaNode(document_.node(nodeId)["type"].toString()) || !engine_) { return; }
    // A modal dialog over the editor, parented to this window and deleted on close.
    auto *dialog = new QDialog(this);
    dialog->setObjectName(QStringLiteral("comfy-workflow-dialog-host"));
    dialog->setWindowTitle(tr("Load ComfyUI workflow"));
    dialog->setAttribute(Qt::WA_DeleteOnClose);
    dialog->setModal(true);
    auto *quick = new QQuickWidget(engine_, dialog);
    // The loader is the QQuickWidget's child, so it outlives the root's bindings.
    auto *loader = new node_editor::ComfyWorkflowLoader(quick);
    loader->configure(tabOwner_->tabsOrigin_, tabOwner_->tabsToken_);
    quick->setResizeMode(QQuickWidget::SizeRootObjectToView);
    quick->setInitialProperties({{"loader", QVariant::fromValue(loader)}});
    quick->setSource(QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/NodeEditor/ComfyWorkflowDialog.qml")));
    if (!quick->rootObject()) { dialog->deleteLater(); return; }
    auto *layout = new QVBoxLayout(dialog);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->addWidget(quick);
    const auto root = quick->rootObject();
    dialog->resize(int(std::ceil(root->implicitWidth())), int(std::ceil(root->implicitHeight())));
    connect(root, &QQuickItem::implicitHeightChanged, dialog, [dialog, root = QPointer<QQuickItem>(root)] {
        if (root) { dialog->resize(dialog->width(), int(std::ceil(root->implicitHeight()))); }
    });
    connect(root, SIGNAL(completed()), dialog, SLOT(accept()));
    connect(this, &EditorWindow::documentEpochChanged, dialog, &QDialog::reject);
    connect(this, &EditorWindow::credentialsEpochChanged, dialog, &QDialog::reject);
    connect(loader, &node_editor::ComfyWorkflowLoader::applied, this, [this, nodeId](const QJsonObject &schema, const QStringList &exposed) {
        const auto node = document_.node(nodeId);
        if (node.isEmpty() || readOnly()) { return; }
        const auto edges = document_.snapshot()["graph"].toObject()["edges"].toArray();
        const auto result = document_.applyCommand(node_editor::comfySchemaCommand(node, edges, schema, exposed), tr("Load ComfyUI workflow"));
        if (!result) { notify(QStringLiteral("error"), result.error); }
    });
    dialog->show();
    quick->setFocus(Qt::PopupFocusReason);
    QMetaObject::invokeMethod(root, "activate");
}
} // namespace nodetool
