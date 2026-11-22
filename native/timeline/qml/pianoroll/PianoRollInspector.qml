// The piano roll's local inspector (Logic-style): the clip header, Time Quantize, Scale Quantize,
// Velocity and the note fields. It holds no note state: every control reads and writes the
// PianoRollPanel it is given, and every edit is one undo entry there. UI thread only.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.UiPrimitives as Ui
import "PianoRollTools.js" as Tools

Rectangle {
    id: root
    objectName: "pianoRollInspector"
    required property var panel
    color: Ui.Theme.surfacePanel
    clip: true

    Ui.Separator { orientation: Qt.Vertical; anchors { right: parent.right; top: parent.top; bottom: parent.bottom } }

    component SectionLabel: Row {
        id: labelRow
        property alias text: caption.text
        property alias valueText: valueLabel.text
        width: parent ? parent.width : 0
        Ui.Text {
            id: caption
            width: labelRow.width - valueLabel.width
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
            elide: Text.ElideRight
        }
        Ui.Text {
            id: valueLabel
            role: Ui.Typography.SansLabel
            horizontalAlignment: Text.AlignRight
        }
    }

    Ui.ScrollArea {
        id: scroll
        anchors { fill: parent; rightMargin: Ui.Metrics.border }
        Column {
            id: column
            width: scroll.availableWidth
            padding: Ui.Metrics.md
            spacing: Ui.Metrics.md
            readonly property real inner: width - 2 * padding

            // a. Clip header
            Row {
                width: column.inner
                spacing: Ui.Metrics.md
                Ui.Icon {
                    anchors.verticalCenter: parent.verticalCenter
                    name: "piano"
                    size: Ui.Metrics.iconLg
                    domainColor: root.panel.clipAccent
                }
                Column {
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width - Ui.Metrics.iconLg - Ui.Metrics.md
                    Ui.Text {
                        objectName: "pianoRollClipName"
                        width: parent.width
                        role: Ui.Typography.SansLabel
                        elide: Text.ElideRight
                        text: root.panel.clipName || qsTr("MIDI clip")
                    }
                    Ui.Text {
                        objectName: "pianoRollTrackName"
                        width: parent.width
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        elide: Text.ElideRight
                        visible: root.panel.trackName !== ""
                        text: qsTr("on Track %1").arg(root.panel.trackName)
                    }
                }
            }
            Ui.Separator { width: column.inner }

            // b. Time Quantize
            Ui.Text { text: qsTr("Time Quantize"); role: Ui.Typography.SansLabel }
            Row {
                width: column.inner
                spacing: Ui.Metrics.sm
                Ui.Select {
                    objectName: "pianoRollQuantizeValue"
                    width: parent.width - quantizeButton.width - Ui.Metrics.sm
                    density: Ui.EditorButton.Compact
                    accessibleName: qsTr("Quantize value")
                    options: Tools.QUANTIZE_OPTIONS
                    value: root.panel.quantizeValue
                    onValueCommitted: next => root.panel.chooseQuantizeValue(next)
                }
                Ui.EditorButton {
                    id: quantizeButton
                    objectName: "pianoRollQuantizeButton"
                    density: Ui.EditorButton.Compact
                    text: qsTr("Q")
                    accessibleName: qsTr("Quantize")
                    enabled: root.panel.controllerEditable
                    onClicked: root.panel.runAction("quantize")
                }
            }
            SectionLabel { text: qsTr("Strength"); valueText: Math.round(root.panel.quantizeStrength) + "%" }
            Ui.Slider {
                objectName: "pianoRollStrength"
                width: column.inner
                density: Ui.EditorButton.Compact
                accessibleName: qsTr("Quantize strength")
                from: 0
                to: 100
                stepSize: 1
                origin: 0
                resetValue: 100
                value: root.panel.quantizeStrength
                onValuePreviewed: next => root.panel.quantizeStrength = next
                onValueCommitted: next => root.panel.quantizeStrength = next
            }
            SectionLabel { text: qsTr("Swing"); valueText: Math.round(root.panel.quantizeSwing) + "%" }
            Ui.Slider {
                objectName: "pianoRollSwing"
                width: column.inner
                density: Ui.EditorButton.Compact
                accessibleName: qsTr("Swing")
                from: 0
                to: 100
                stepSize: 1
                origin: 0
                resetValue: 0
                value: root.panel.quantizeSwing
                onValuePreviewed: next => root.panel.quantizeSwing = next
                onValueCommitted: next => root.panel.quantizeSwing = next
            }
            Ui.Separator { width: column.inner }

            // c. Scale Quantize
            Ui.Text { text: qsTr("Scale Quantize"); role: Ui.Typography.SansLabel }
            Row {
                width: column.inner
                spacing: Ui.Metrics.sm
                Ui.Select {
                    objectName: "pianoRollScaleRoot"
                    width: Ui.Metrics.xxxl * 2
                    density: Ui.EditorButton.Compact
                    accessibleName: qsTr("Scale root")
                    options: Tools.ROOT_OPTIONS
                    value: root.panel.scaleRoot
                    onValueCommitted: next => root.panel.scaleRoot = next
                }
                Ui.Select {
                    objectName: "pianoRollScaleType"
                    width: parent.width - Ui.Metrics.xxxl * 2 - Ui.Metrics.sm
                    density: Ui.EditorButton.Compact
                    accessibleName: qsTr("Scale")
                    options: Tools.scaleOptions(qsTr("Chromatic"))
                    value: root.panel.scaleId
                    onValueCommitted: next => root.panel.scaleId = next
                }
            }
            Ui.EditorButton {
                objectName: "pianoRollScaleQuantizeButton"
                density: Ui.EditorButton.Compact
                text: qsTr("Q")
                accessibleName: qsTr("Scale quantize")
                enabled: root.panel.scaleActive && root.panel.controllerEditable
                onClicked: root.panel.runAction("scaleQuantize")
            }
            Ui.CheckBox {
                objectName: "pianoRollSnapToScale"
                text: qsTr("Snap to Scale")
                checked: root.panel.snapToScale
                onCheckedChangedByUser: next => root.panel.snapToScale = next
            }
            Ui.Separator { width: column.inner }

            // d. Velocity
            SectionLabel { text: qsTr("Velocity"); valueText: root.panel.selectedIds.length > 0 ? String(root.panel.shownVelocity) : "" }
            Ui.Slider {
                objectName: "pianoRollVelocitySlider"
                width: column.inner
                density: Ui.EditorButton.Compact
                accessibleName: qsTr("Velocity")
                from: 1
                to: 127
                stepSize: 1
                enabled: root.panel.selectedIds.length > 0 && root.panel.controllerEditable
                value: root.panel.shownVelocity
                onEditStarted: root.panel.velocityBegin()
                onValuePreviewed: next => root.panel.velocityPreview(next)
                onValueCommitted: next => root.panel.velocityCommit(next)
                onEditCanceled: root.panel.velocityCancel()
            }
            Ui.Separator { width: column.inner }

            // e. Note
            // Mixed fields must commit even when the draft equals the first selected value.
            Ui.Text { text: qsTr("Note"); role: Ui.Typography.SansLabel }
            Row {
                objectName: "pianoRollNoteFields"
                width: column.inner
                spacing: Ui.Metrics.md
                visible: root.panel.selectedIds.length > 0
                Column {
                    width: (parent.width - Ui.Metrics.md) / 2
                    spacing: Ui.Metrics.xs
                    Ui.Text { text: qsTr("Channel"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                    Ui.NumberField {
                        objectName: "pianoRollChannel"
                        width: parent.width
                        density: Ui.EditorButton.Compact
                        accessibleName: qsTr("MIDI channel")
                        variant: root.panel.channelState.mixed ? Ui.NumberField.Node : Ui.NumberField.Field
                        from: 1
                        to: 16
                        value: root.panel.channelState.value + 1
                        displayValue: root.panel.channelState.mixed ? qsTr("Mixed") : String(root.panel.channelState.value + 1)
                        enabled: root.panel.controllerEditable
                        onEditStarted: if (root.panel.channelState.mixed) editBaseline = NaN
                        onValueCommitted: next => root.panel.setNoteField("channel", Math.round(next) - 1)
                    }
                }
                Column {
                    width: (parent.width - Ui.Metrics.md) / 2
                    spacing: Ui.Metrics.xs
                    Ui.Text { text: qsTr("Release velocity"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; elide: Text.ElideRight; width: parent.width }
                    Ui.NumberField {
                        objectName: "pianoRollReleaseVelocity"
                        width: parent.width
                        density: Ui.EditorButton.Compact
                        accessibleName: qsTr("Release velocity")
                        variant: root.panel.releaseState.mixed ? Ui.NumberField.Node : Ui.NumberField.Field
                        from: 0
                        to: 127
                        value: root.panel.releaseState.value
                        displayValue: root.panel.releaseState.mixed ? qsTr("Mixed") : String(root.panel.releaseState.value)
                        enabled: root.panel.controllerEditable
                        onEditStarted: if (root.panel.releaseState.mixed) editBaseline = NaN
                        onValueCommitted: next => root.panel.setNoteField("releaseVelocity", Math.round(next))
                    }
                }
            }
        }
    }
}
