// The Scene Edit Detection dialog: it analyses the selected video clips while
// the options stay editable, shows how many cuts the options find, and applies
// them as cuts or as markers.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Dialog {
    id: dialog
    objectName: "sceneEditDialog"
    property var timeline: null
    readonly property alias controller: scene
    readonly property string state: scene.state
    readonly property bool analyzing: scene.state === "analyzing"
    readonly property bool applied: scene.state === "applied"
    readonly property alias sensitivitySlider: sensitivity
    readonly property alias shotField: minShot
    readonly property alias applyButton: applyCuts
    readonly property alias markersButton: createMarkers

    function openFor(clipIds) {
        if (!timeline) return
        scene.begin(clipIds)
        open()
    }

    title: "Scene edit detection"
    width: Math.min(Ui.Metrics.dialogCompactWidth, parent ? parent.width - Ui.Metrics.xl * 2 : Ui.Metrics.dialogCompactWidth)
    height: Math.min(implicitHeight, parent ? parent.height - Ui.Metrics.xl * 2 : implicitHeight)
    onClosed: scene.reset()

    SceneEditController {
        id: scene
        timeline: dialog.timeline
    }

    component FieldLabel: Ui.Text {
        Layout.fillWidth: true
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Secondary
        wrapMode: Text.Wrap
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.Metrics.lg

        ColumnLayout {
            Layout.fillWidth: true
            visible: dialog.analyzing
            spacing: Ui.Metrics.sm
            RowLayout {
                Layout.fillWidth: true
                Ui.Text {
                    objectName: "sceneStatus"
                    Layout.fillWidth: true
                    text: scene.status
                    role: Ui.Typography.SansBody
                    elide: Text.ElideRight
                }
                Ui.Text {
                    text: Math.round(scene.progress * 100) + "%"
                    role: Ui.Typography.MonoLabel
                    tone: Ui.Text.Secondary
                }
            }
            Ui.Progress {
                objectName: "sceneProgress"
                Layout.fillWidth: true
                value: scene.progress
                accessibleName: "Analysis progress"
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            visible: !dialog.analyzing
            spacing: Ui.Metrics.sm
            Ui.Text {
                objectName: "sceneSummary"
                Layout.fillWidth: true
                text: dialog.applied ? scene.outcome : scene.summary
                role: Ui.Typography.SansBody
                wrapMode: Text.Wrap
                Accessible.role: Accessible.StaticText
                Accessible.name: text
            }
            Repeater {
                model: scene.state === "ready" && scene.clips.length > 1 ? scene.clips : []
                delegate: RowLayout {
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.md
                    Ui.Text {
                        Layout.fillWidth: true
                        text: modelData.name
                        role: Ui.Typography.SansLabel
                        elide: Text.ElideRight
                    }
                    Ui.Text {
                        text: modelData.note !== "" ? "Not read" : modelData.cuts + (modelData.cuts === 1 ? " cut" : " cuts")
                        role: Ui.Typography.MonoLabel
                        tone: Ui.Text.Secondary
                    }
                }
            }
            Ui.Text {
                objectName: "sceneNotice"
                Layout.fillWidth: true
                visible: scene.notice !== ""
                text: scene.notice
                role: Ui.Typography.SansLabel
                tone: scene.state === "failed" ? Ui.Text.Error : Ui.Text.Warning
                wrapMode: Text.Wrap
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            visible: scene.state === "analyzing" || scene.state === "ready"
            spacing: Ui.Metrics.lg
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Ui.Metrics.xs
                RowLayout {
                    Layout.fillWidth: true
                    FieldLabel { text: "Sensitivity" }
                    Ui.Text {
                        text: Math.round(scene.sensitivity)
                        role: Ui.Typography.MonoLabel
                        tone: Ui.Text.Secondary
                    }
                }
                Ui.Slider {
                    id: sensitivity
                    objectName: "sceneSensitivity"
                    Layout.fillWidth: true
                    from: 0
                    to: 100
                    stepSize: 1
                    value: scene.sensitivity
                    density: Ui.EditorButton.Compact
                    accessibleName: "Sensitivity"
                    onValuePreviewed: next => scene.sensitivity = next
                    onValueCommitted: next => scene.sensitivity = next
                }
                Ui.Text {
                    Layout.fillWidth: true
                    text: "Higher finds subtler cuts. Lower keeps only the obvious ones."
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    wrapMode: Text.Wrap
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: Ui.Metrics.xs
                FieldLabel { text: "Shortest shot" }
                Ui.NumberField {
                    id: minShot
                    objectName: "sceneMinShot"
                    Layout.fillWidth: true
                    density: Ui.EditorButton.Compact
                    accessibleName: "Shortest shot in frames"
                    unit: "frames"
                    from: 1
                    to: 600
                    value: scene.minShotFrames
                    onValuePreviewed: next => scene.minShotFrames = Math.round(next)
                    onValueCommitted: next => scene.minShotFrames = Math.round(next)
                }
                Ui.Text {
                    Layout.fillWidth: true
                    text: "A cut closer than this to the one before is ignored, which skips flashes."
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    wrapMode: Text.Wrap
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Item { Layout.fillWidth: true }
            Ui.EditorButton {
                objectName: "sceneClose"
                density: Ui.EditorButton.Compact
                text: dialog.analyzing ? "Stop" : dialog.applied ? "Done" : "Cancel"
                onClicked: dialog.analyzing ? scene.cancel() : dialog.close()
            }
            Ui.EditorButton {
                id: createMarkers
                objectName: "sceneCreateMarkers"
                density: Ui.EditorButton.Compact
                visible: !dialog.applied
                text: "Create Markers"
                enabled: scene.canCreateMarkers
                disabledReason: dialog.analyzing ? "Wait for the analysis to finish." : "No cuts were found."
                onClicked: scene.createMarkers()
            }
            Ui.EditorButton {
                id: applyCuts
                objectName: "sceneApplyCuts"
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Primary
                visible: !dialog.applied
                text: "Apply Cuts"
                enabled: scene.canApplyCuts
                disabledReason: dialog.analyzing ? "Wait for the analysis to finish."
                    : scene.cutCount === 0 ? "No cuts were found." : "These clips cannot be cut."
                onClicked: scene.applyCuts()
            }
        }
    }
}
