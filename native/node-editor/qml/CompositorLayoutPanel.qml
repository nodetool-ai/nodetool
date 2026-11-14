pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// CompositorEditor.tsx's side panel: the canvas size, the selected layer's
// transform with Reset, and the layer stack with Add layer. The stage beside
// it is the editor's CompositorStage.
Rectangle {
    id: root
    objectName: "compositor-layout-panel"
    // The dialog's CompositorLayoutEditor.
    required property var editor
    color: Ui.Theme.surfacePanel
    implicitWidth: Ui.Metrics.panelWidth
    implicitHeight: Ui.Metrics.standard * 16

    component Field: ColumnLayout {
        id: field
        property string label: ""
        property string name: ""
        property alias value: input.value
        property alias from: input.from
        property alias to: input.to
        signal committed(real value)
        Layout.fillWidth: true
        spacing: Ui.Metrics.micro
        Ui.Text { text: field.label; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
        Ui.NumberField {
            id: input
            objectName: "compositor-field-" + field.name
            Layout.fillWidth: true
            accessibleName: field.label
            density: Ui.EditorButton.Compact
            previewWhileTyping: false
            onValueCommitted: next => field.committed(next)
        }
    }

    Basic.ScrollView {
        anchors.fill: parent
        contentWidth: availableWidth
        Basic.ScrollBar.vertical: Ui.ScrollBar {}
        ColumnLayout {
            width: parent.width
            spacing: Ui.Metrics.md
            Item { implicitHeight: Ui.Metrics.sm }

            Ui.Text {
                Layout.leftMargin: Ui.Metrics.lg
                text: "Canvas size"
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            RowLayout {
                Layout.leftMargin: Ui.Metrics.lg
                Layout.rightMargin: Ui.Metrics.lg
                spacing: Ui.Metrics.sm
                Field {
                    label: "Width"; name: "canvasWidth"
                    value: root.editor.canvasWidth; from: 1; to: 16384
                    onCommitted: next => root.editor.setCanvasSize(Math.round(next), root.editor.canvasHeight)
                }
                Field {
                    label: "Height"; name: "canvasHeight"
                    value: root.editor.canvasHeight; from: 1; to: 16384
                    onCommitted: next => root.editor.setCanvasSize(root.editor.canvasWidth, Math.round(next))
                }
            }
            Ui.Separator { Layout.fillWidth: true }

            Ui.PanelHeader {
                Layout.leftMargin: Ui.Metrics.lg
                Layout.rightMargin: Ui.Metrics.lg
                Layout.fillWidth: true
                visible: root.editor.selected >= 0
                text: "Selected layer"
                Ui.ToolbarIconButton {
                    objectName: "compositor-reset-transform"
                    iconName: "reset"
                    accessibleName: "Reset transform"
                    onClicked: root.editor.resetTransform()
                }
            }
            GridLayout {
                Layout.leftMargin: Ui.Metrics.lg
                Layout.rightMargin: Ui.Metrics.lg
                Layout.fillWidth: true
                visible: root.editor.selected >= 0
                columns: 2
                columnSpacing: Ui.Metrics.sm
                rowSpacing: Ui.Metrics.sm
                Field { label: "X"; name: "x"; value: root.editor.transform.x ?? 0; onCommitted: next => root.editor.setTransformField(name, next) }
                Field { label: "Y"; name: "y"; value: root.editor.transform.y ?? 0; onCommitted: next => root.editor.setTransformField(name, next) }
                Field {
                    label: "Scale X"; name: "scaleX"; from: 0.02; to: 64
                    value: root.editor.transform.scaleX ?? 1
                    onCommitted: next => root.editor.setTransformField(name, next)
                }
                Field {
                    label: "Scale Y"; name: "scaleY"; from: 0.02; to: 64
                    value: root.editor.transform.scaleY ?? 1
                    onCommitted: next => root.editor.setTransformField(name, next)
                }
                Field {
                    label: "Rotation°"; name: "rotation"; from: -360; to: 360
                    value: root.editor.transform.rotation ?? 0
                    onCommitted: next => root.editor.setTransformField(name, next)
                }
            }
            Ui.Text {
                Layout.leftMargin: Ui.Metrics.lg
                Layout.rightMargin: Ui.Metrics.lg
                Layout.fillWidth: true
                visible: root.editor.selected < 0
                text: "Select a layer to transform it."
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                wrapMode: Text.Wrap
            }
            Ui.Separator { Layout.fillWidth: true }

            Ui.Text {
                Layout.leftMargin: Ui.Metrics.lg
                text: "Layers"
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            Ui.EmptyState {
                Layout.fillWidth: true
                visible: root.editor.layers.length === 0
                title: "No layers yet"
                message: "Add one below."
            }
            Repeater {
                model: root.editor.layers
                delegate: Ui.ListRow {
                    id: layerRow
                    required property var modelData
                    required property int index
                    objectName: "compositor-layer-" + index
                    Layout.fillWidth: true
                    Layout.leftMargin: Ui.Metrics.sm
                    Layout.rightMargin: Ui.Metrics.sm
                    accessibleName: modelData.name
                    active: root.editor.selected === index
                    onClicked: root.editor.select(index)
                    ColumnLayout {
                        width: layerRow.availableWidth
                        spacing: Ui.Metrics.micro
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.xs
                            Ui.Text {
                                Layout.fillWidth: true
                                text: layerRow.modelData.name
                                role: Ui.Typography.SansLabel
                                tone: layerRow.modelData.visible ? Ui.Text.Primary : Ui.Text.Secondary
                                elide: Text.ElideRight
                            }
                            Ui.ToolbarIconButton {
                                objectName: "compositor-visible-" + layerRow.index
                                iconName: layerRow.modelData.visible ? "visibility" : "visibilityOff"
                                accessibleName: layerRow.modelData.visible ? "Hide" : "Show"
                                onClicked: root.editor.toggleVisible(layerRow.index)
                            }
                            Ui.ToolbarIconButton {
                                objectName: "compositor-delete-" + layerRow.index
                                iconName: "deleteOutline"
                                accessibleName: "Delete layer"
                                onClicked: root.editor.deleteLayer(layerRow.index)
                            }
                        }
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.sm
                            Ui.Slider {
                                objectName: "compositor-opacity-" + layerRow.index
                                Layout.fillWidth: true
                                accessibleName: "Opacity"
                                density: Ui.EditorButton.Compact
                                value: layerRow.modelData.opacity
                                onValuePreviewed: next => root.editor.setOpacity(layerRow.index, next, false)
                                onValueCommitted: next => root.editor.setOpacity(layerRow.index, next, true)
                                onEditCanceled: root.editor.setOpacity(layerRow.index, layerRow.modelData.opacity, true)
                            }
                            Ui.Select {
                                objectName: "compositor-blend-" + layerRow.index
                                Layout.preferredWidth: Ui.Metrics.xxxl * 3
                                accessibleName: "Blend mode"
                                density: Ui.EditorButton.Compact
                                options: root.editor.blendModes
                                value: layerRow.modelData.blend
                                onValueCommitted: next => root.editor.setBlend(layerRow.index, next)
                            }
                        }
                    }
                }
            }
            Ui.EditorButton {
                objectName: "compositor-add-layer"
                Layout.leftMargin: Ui.Metrics.lg
                text: "Add layer"
                iconName: "add"
                onClicked: root.editor.addLayer()
            }
            Item { implicitHeight: Ui.Metrics.lg }
        }
    }
}
