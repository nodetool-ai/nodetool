// Comfy workflows in the editor window: the Comfy target control, the target's
// node catalog and new Comfy workflows. See ComfyTargetSelector.tsx,
// useComfyNodeMetadata.ts and useStartComfyWorkflow.ts on the web.
#include "ui/EditorWindow.h"
#include "document/ChildPorts.h"
#include "graph/NodeCreation.h"
#include <QActionGroup>
#include <QCursor>
#include <QInputDialog>
#include <QLineEdit>
#include <QMenu>
#include <QMessageBox>
#include <QPushButton>
#include <QPointer>
#include <QQuickWidget>

namespace nodetool {

void EditorWindow::installComfy() {
    if (!tabOwner_) {
        // The root window owns the target, so it reports its errors and opens
        // the workflows it creates.
        connect(&comfy_, &node_editor::ComfyBackend::errorOccurred, this, [this](const QString &message) { notify(QStringLiteral("error"), message); });
        connect(&comfy_, &node_editor::ComfyBackend::noticeOccurred, this, [this](const QString &message) { notify(QStringLiteral("success"), message); });
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
    editorCommands_.setComfyTarget(comfyWorkflow_ ? comfyBackend()->toolbarLabel() : QString{});
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
    addComfyRentActions(menu);
    // The menu opens above the toolbar, as the web anchors it.
    auto anchor = toolbarOverlay_ ? toolbarOverlay_->mapToGlobal(QPoint(0, 0)) : QCursor::pos();
    anchor.ry() -= menu.sizeHint().height();
    menu.exec(anchor);
}

// Renting a ComfyUI worker without leaving the target control: pick a preset,
// confirm its price, and the target switches once ComfyUI answers. Rented
// workers are released from the same menu.
void EditorWindow::addComfyRentActions(QMenu &menu) {
    auto *comfy = comfyBackend();
    const auto rented = comfy->rentedWorkers();
    if (!comfy->renting() && comfy->rentPresets().isEmpty() && rented.isEmpty()) { return; }
    menu.addSeparator();
    QPointer<EditorWindow> self(this);
    if (comfy->renting()) {
        auto *status = menu.addAction(comfy->rentLabel());
        status->setObjectName(QStringLiteral("comfy-rent-status"));
        status->setEnabled(false);
        auto *cancel = menu.addAction(tr("Cancel and release the worker"));
        cancel->setObjectName(QStringLiteral("comfy-rent-cancel"));
        connect(cancel, &QAction::triggered, comfy, &node_editor::ComfyBackend::cancelRent);
    } else if (comfy->rentKeyMissing()) {
        auto *key = menu.addAction(tr("Rent a ComfyUI worker: add a RunPod API key…"));
        key->setObjectName(QStringLiteral("comfy-rent-key"));
        connect(key, &QAction::triggered, this, [self] {
            if (self) { self->showWorkers(); }
        });
    } else if (!comfy->rentPresets().isEmpty()) {
        menu.addAction(tr("Rent a ComfyUI worker on RunPod"))->setEnabled(false);
        for (const auto &value : comfy->rentPresets()) {
            const auto preset = value.toMap();
            const auto id = preset["id"].toString();
            const auto price = preset["price"].toString();
            auto *action = menu.addAction(price.isEmpty() ? tr("Rent %1…").arg(preset["label"].toString())
                                                          : tr("Rent %1 (%2)…").arg(preset["label"].toString(), price));
            action->setObjectName(QStringLiteral("comfy-rent-") + id);
            connect(action, &QAction::triggered, this, [self, id, preset] {
                if (self && self->confirmComfyRent(preset)) { self->comfyBackend()->rentWorker(id); }
            });
        }
    }
    for (const auto &value : rented) {
        const auto worker = value.toMap();
        const auto id = worker["id"].toString();
        const auto name = worker["name"].toString();
        QString text = tr("Release %1").arg(name);
        if (!worker["cost"].toString().isEmpty()) { text += QStringLiteral(" ") + tr("(%1 so far)").arg(worker["cost"].toString()); }
        auto *release = menu.addAction(text + QStringLiteral("…"));
        release->setObjectName(QStringLiteral("comfy-release-") + id);
        release->setToolTip(worker["current"].toBool() ? tr("Comfy workflows run on this worker now") : worker["status"].toString());
        connect(release, &QAction::triggered, this, [self, id, name] {
            if (!self) { return; }
            QMessageBox box(QMessageBox::Question, tr("Release worker"),
                            tr("Release %1? The worker is terminated, its billing ends, and the models it downloaded are deleted.").arg(name),
                            QMessageBox::Cancel, self);
            auto *ok = box.addButton(tr("Release worker"), QMessageBox::AcceptRole);
            box.setDefaultButton(ok);
            box.exec();
            if (self && box.clickedButton() == ok) { self->comfyBackend()->releaseWorker(id); }
        });
    }
    connect(menu.addAction(tr("Manage workers…")), &QAction::triggered, this, [self] {
        if (self) { self->showWorkers(); }
    });
}

bool EditorWindow::confirmComfyRent(const QVariantMap &preset) {
    if (comfyRentConfirm_) { return comfyRentConfirm_(preset); }
    QMessageBox box(QMessageBox::Question, tr("Rent a ComfyUI worker"), preset["confirm"].toString(), QMessageBox::Cancel, this);
    const auto price = preset["price"].toString();
    auto *ok = box.addButton(price.isEmpty() ? tr("Rent worker") : tr("Rent for %1").arg(price), QMessageBox::AcceptRole);
    box.setDefaultButton(QMessageBox::Cancel);
    box.exec();
    return box.clickedButton() == ok;
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

void EditorWindow::addComfySubgraphAt(const QPointF &position) {
    if (!tabOwner_) {
        activeEditor_->addComfySubgraphAt(position);
        return;
    }
    auto *comfy = comfyBackend();
    if (!comfy->configured()) {
        notify(QStringLiteral("error"), tr("Connect to a server to add a Comfy subgraph."));
        return;
    }
    const auto epoch = documentEpoch_;
    QPointer<EditorWindow> self(this);
    comfy->starterGraph([self, epoch, position](const QJsonObject &graph, const QString &error) {
        if (!self || epoch != self->documentEpoch_ || self->readOnly()) { return; }
        if (!error.isEmpty()) {
            self->notify(QStringLiteral("error"), tr("Could not add Comfy subgraph: %1").arg(error));
            return;
        }
        static const auto subgraphType = QStringLiteral("nodetool.workflows.subgraph.Subgraph");
        for (const auto &entry : self->metadata_) {
            const auto metadata = entry.toObject();
            if (metadata["node_type"].toString(metadata["type"].toString()) != subgraphType) { continue; }
            auto node = createNativeNode(metadata, position, self->document_.nodes(), {{"graph", graph}});
            auto ui = node["ui_properties"].toObject();
            ui["title"] = QStringLiteral("Comfy subgraph");
            node["ui_properties"] = ui;
            // The prompt input and image output the server derives on a run.
            node = node_editor::withChildPorts(node, self->metadata_);
            if (self->apply({{"op", "addNode"}, {"node", node}})) { self->rememberRecentNode(subgraphType); }
            return;
        }
        self->notify(QStringLiteral("error"), tr("The node catalog has no Subgraph node."));
    });
}

}  // namespace nodetool
