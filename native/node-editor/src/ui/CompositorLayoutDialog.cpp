#include "EditorWindow.h"
#include "properties/CompositorLayoutEditor.h"
#include <QDialog>
#include <QHBoxLayout>
#include <QQuickItem>
#include <QQuickWidget>

namespace nodetool {
namespace {
std::optional<QtNodes::NodeId> modelNode(const WorkflowGraphModel &model, const QString &resource) {
    for (const auto id : model.allNodeIds()) {
        if (model.resourceId(id) == resource) { return id; }
    }
    return std::nullopt;
}
} // namespace

void EditorWindow::showCompositorLayoutDialog(const QString &nodeId) {
    if (!tabOwner_) {
        activeEditor_->showCompositorLayoutDialog(nodeId);
        return;
    }
    const auto id = modelNode(model_, nodeId);
    if (readOnly() || !id || model_.layout(*id).body != CardBody::Compositor || !engine_) { return; }
    // A modal dialog over the editor, parented to this window and deleted on close.
    auto *dialog = new QDialog(this);
    dialog->setObjectName(QStringLiteral("compositor-layout-dialog-host"));
    dialog->setWindowTitle(tr("Compositor"));
    dialog->setAttribute(Qt::WA_DeleteOnClose);
    dialog->setModal(true);
    auto *quick = new QQuickWidget(engine_, dialog);
    // The editor is the QQuickWidget's child, so it outlives the panel's bindings.
    auto *editor = new node_editor::CompositorLayoutEditor(quick);
    editor->setObjectName(QStringLiteral("compositor-layout-editor"));
    editor->setNode(document_.node(nodeId), model_.layout(*id).sources);
    quick->setResizeMode(QQuickWidget::SizeRootObjectToView);
    quick->setInitialProperties({{"editor", QVariant::fromValue(editor)}});
    quick->setSource(QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/NodeEditor/CompositorLayoutPanel.qml")));
    if (!quick->rootObject()) { dialog->deleteLater(); return; }
    quick->setFixedWidth(int(std::ceil(quick->rootObject()->implicitWidth())));
    // The stage is the dialog's child and borrows the editor through a QPointer.
    auto *stage = new node_editor::CompositorStage(editor, scene_->theme(), dialog);
    auto *layout = new QHBoxLayout(dialog);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(0);
    layout->addWidget(stage, 1);
    layout->addWidget(quick);
    dialog->resize(stage->sizeHint().width() + quick->width(), stage->sizeHint().height());
    // The dialog follows the node: an undo, a card edit or a loaded image
    // refreshes it, and it closes when the node or the document goes away.
    const auto refresh = [this, dialog, editor, nodeId] {
        const auto current = modelNode(model_, nodeId);
        if (!current || model_.layout(*current).body != CardBody::Compositor) {
            dialog->reject();
            return;
        }
        editor->setNode(document_.node(nodeId), model_.layout(*current).sources);
    };
    connect(&model_, &WorkflowGraphModel::nodeUpdated, editor, [this, refresh, nodeId](QtNodes::NodeId updated) {
        if (model_.resourceId(updated) == nodeId) { refresh(); }
    });
    connect(&model_, &WorkflowGraphModel::projectionChanged, editor, refresh);
    connect(this, &EditorWindow::documentEpochChanged, dialog, &QDialog::reject);
    connect(editor, &node_editor::CompositorLayoutEditor::commandRequested, this, [this, editor, nodeId](const QJsonObject &command, const QString &title) {
        if (readOnly()) { return; }
        const auto result = document_.applyCommand(command, title);
        if (!result) {
            notify(QStringLiteral("error"), result.error);
            return;
        }
        // The card reprojects later. The editor takes the committed node now,
        // so a second edit builds on the first.
        const auto sources = editor->sources();
        editor->setNode(document_.node(nodeId), sources);
    });
    connect(editor, &node_editor::CompositorLayoutEditor::layerActionRequested, this, [this, nodeId](const QString &action, int index) {
        if (const auto current = modelNode(model_, nodeId)) { model_.compositorAction(*current, action, index); }
    });
    dialog->show();
}
} // namespace nodetool
