import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import NodeTool.ModelPicker

// Renders one shot's still or clip with a model the creator picks here. The picker opens on the
// model the shot used last, so a confirm without a change is the one-click regenerate.
Ui.Dialog {
    id: dialog
    objectName: "shotRenderDialog"
    property string kind: "image"
    signal renderRequested(string kind, var model)
    title: kind === "image" ? "Render still" : "Render clip"
    width: parent ? Math.min(Ui.Metrics.dialogWidth, parent.width) : Ui.Metrics.dialogWidth

    function openFor(nextKind, mode, last) {
        kind = nextKind
        catalog.mode = mode
        if (last && last.id && last.provider) catalog.selectModel(last.id, last.provider)
        open()
    }

    ModelCatalogController { id: catalog }

    contentItem: ColumnLayout {
        spacing: Ui.Metrics.md
        Ui.Text {
            Layout.fillWidth: true
            wrapMode: Text.Wrap
            tone: Ui.Text.Secondary
            text: "Choose the model for this shot's " + (dialog.kind === "image" ? "still" : "clip") + ". The shot keeps it for the next render."
        }
        ModelPickerButton {
            objectName: "shotRenderModel"
            Layout.fillWidth: true
            catalog: catalog
            Accessible.name: dialog.kind === "image" ? "Still model" : "Clip model"
        }
        Ui.Text { Layout.fillWidth: true; visible: catalog.error !== ""; text: catalog.error; tone: Ui.Text.Error; wrapMode: Text.Wrap }
    }
    footer: RowLayout {
        spacing: Ui.Metrics.sm
        Item { Layout.fillWidth: true }
        Ui.EditorButton { Layout.bottomMargin: Ui.Metrics.xl; text: "Cancel"; onClicked: dialog.close() }
        Ui.EditorButton {
            objectName: "shotRenderStart"
            Layout.bottomMargin: Ui.Metrics.xl
            Layout.rightMargin: Ui.Metrics.xl
            variant: Ui.EditorButton.Primary
            text: "Render"
            enabled: catalog.selectionAvailable
            onClicked: {
                const model = catalog.selectedModel
                dialog.close()
                dialog.renderRequested(dialog.kind, {id: model.id, provider: model.provider, supported_tasks: model.supported_tasks || []})
            }
        }
    }
}
