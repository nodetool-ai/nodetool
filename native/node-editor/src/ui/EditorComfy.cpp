// Comfy workflows in the editor window: the Comfy target control, the target's
// node catalog and new Comfy workflows. See ComfyTargetSelector.tsx,
// useComfyNodeMetadata.ts and useStartComfyWorkflow.ts on the web.
#include "ui/EditorWindow.h"
#include <QActionGroup>
#include <QCursor>
#include <QInputDialog>
#include <QLineEdit>
#include <QMenu>
#include <QPointer>
#include <QQuickWidget>

namespace nodetool {

void EditorWindow::installComfy() {
    if (!tabOwner_) {
        // The root window owns the target, so it reports its errors and opens
        // the workflows it creates.
        connect(&comfy_, &node_editor::ComfyBackend::errorOccurred, this, [this](const QString &message) { notify(QStringLiteral("error"), message); });
        connect(&comfy_, &node_editor::ComfyBackend::workflowCreated, this, &EditorWindow::openWorkflow);
        return;
    }
    auto *comfy = comfyBackend();
    connect(&document_, &node_editor::WorkflowDocument::replaced, this, &EditorWindow::syncComfyWorkflow);
    connect(&session_, &node_editor::WorkflowSession::workflowChanged, this, &EditorWindow::syncComfyWorkflow);
    connect(comfy, &node_editor::ComfyBackend::changed, this, &EditorWindow::syncComfyTarget);
    // refreshComfyNodeCatalog: reload a catalog in use, or drop it so the next
    // Comfy workflow loads the new target's nodes.
    connect(comfy, &node_editor::ComfyBackend::targetChanged, this, [this] {
        if (comfyWorkflow_) {
            reloadComfyCatalog();
        } else {
            comfyCatalogLoaded_ = false;
        }
    });
}

void EditorWindow::syncComfyWorkflow() {
    const bool comfy = node_editor::comfyWorkflow(document_.snapshot());
    if (comfy != comfyWorkflow_) {
        comfyWorkflow_ = comfy;
        // The node menu offers the other kind of node now.
        setCatalog(baseCatalog_);
    }
    if (comfy && !comfyCatalogLoaded_ && !comfyCatalogLoading_ && comfyBackend()->ready()) { reloadComfyCatalog(); }
    syncComfyTarget();
}

void EditorWindow::reloadComfyCatalog() {
    comfyCatalogLoading_ = true;
    const auto epoch = ++comfyCatalogEpoch_;
    // The backend outlives no tab's callback: it is the root's, and a closed tab is a null QPointer.
    QPointer<EditorWindow> self(this);
    comfyBackend()->loadCatalog([self, epoch](const QJsonArray &records, const QString &error) {
        if (!self || epoch != self->comfyCatalogEpoch_) { return; }
        self->comfyCatalogLoading_ = false;
        if (!error.isEmpty()) {
            // The previous catalog stays in place.
            self->notify(QStringLiteral("error"), tr("Comfy nodes could not load: %1").arg(error));
            return;
        }
        self->comfyCatalogLoaded_ = true;
        self->comfyRecords_ = node_editor::nextComfyRecords(self->comfyRecords_, records);
        self->setCatalog(self->baseCatalog_);
    });
}

void EditorWindow::syncComfyTarget() {
    editorCommands_.setComfyTarget(comfyWorkflow_ ? comfyBackend()->label() : QString{});
}

void EditorWindow::showComfyTargetMenu() {
    if (!tabOwner_) {
        activeEditor_->showComfyTargetMenu();
        return;
    }
    auto *comfy = comfyBackend();
    comfy->refresh();
    QMenu menu(this);
    menu.setObjectName(QStringLiteral("comfy-target-menu"));
    menu.setToolTipsVisible(true);
    auto *group = new QActionGroup(&menu);  // Parented to the menu.
    const auto kind = comfy->kind();
    // LocalComfyConnect's status line: whether the saved ComfyUI answered.
    if (!comfy->serverUrl().isEmpty()) {
        auto *status = menu.addAction(comfy->statusText());
        status->setObjectName(QStringLiteral("comfy-status"));
        status->setEnabled(false);
        if (!comfy->modelsText().isEmpty()) { menu.addAction(comfy->modelsText())->setEnabled(false); }
        if (comfy->statusState() == QLatin1String("error")) {
            connect(menu.addAction(tr("Check again")), &QAction::triggered, comfy, &node_editor::ComfyBackend::checkStatus);
        }
        menu.addSeparator();
    }
    const auto radio = [&](const QString &label, const QString &tip, bool checked) {
        auto *action = menu.addAction(label);
        action->setToolTip(tip);
        action->setCheckable(true);
        action->setChecked(checked);
        group->addAction(action);
        return action;
    };
    connect(radio(tr("Comfy Cloud"), tr("Comfy's GPUs, with your COMFY_API_KEY"), kind == QLatin1String("cloud")),
            &QAction::triggered, comfy, &node_editor::ComfyBackend::selectCloud);
    for (const auto &value : comfy->workers()) {
        const auto worker = value.toMap();
        const auto id = worker["id"].toString();
        auto *action = radio(tr("Worker: %1").arg(worker["name"].toString()), worker["host"].toString(),
                             kind == QLatin1String("worker") && comfy->workerUrl() == worker["wsUrl"].toString());
        connect(action, &QAction::triggered, comfy, [comfy, id] { comfy->selectWorker(id); });
    }
    menu.addSeparator();
    const auto serverUrl = comfy->serverUrl();
    auto *server = radio(serverUrl.isEmpty() ? tr("ComfyUI server") : comfy->label(),
                         serverUrl.isEmpty() ? tr("Enter a URL below") : serverUrl, kind == QLatin1String("server"));
    server->setEnabled(!serverUrl.isEmpty());
    connect(server, &QAction::triggered, comfy, [comfy, serverUrl] { comfy->selectServer(serverUrl); });
    auto *address = menu.addAction(tr("Set ComfyUI server URL…"));
    address->setObjectName(QStringLiteral("comfy-server-url"));
    QPointer<EditorWindow> self(this);
    connect(address, &QAction::triggered, this, [self, comfy, serverUrl] {
        bool ok = false;
        const auto url = QInputDialog::getText(self, tr("ComfyUI server"), tr("ComfyUI server URL"), QLineEdit::Normal,
                                               serverUrl.isEmpty() ? QStringLiteral("http://127.0.0.1:8188") : serverUrl, &ok);
        if (self && ok && !url.trimmed().isEmpty()) { comfy->selectServer(url); }
    });
    // The menu opens above the toolbar, as the web anchors it.
    auto anchor = toolbarOverlay_ ? toolbarOverlay_->mapToGlobal(QPoint(0, 0)) : QCursor::pos();
    anchor.ry() -= menu.sizeHint().height();
    menu.exec(anchor);
}

void EditorWindow::newComfyWorkflow() {
    if (!tabOwner_) {
        activeEditor_->newComfyWorkflow();
        return;
    }
    auto *comfy = comfyBackend();
    if (!comfy->configured()) {
        notify(QStringLiteral("error"), tr("Connect to a server to start a Comfy workflow."));
        return;
    }
    comfy->createWorkflow(activeProject());
}

}  // namespace nodetool
