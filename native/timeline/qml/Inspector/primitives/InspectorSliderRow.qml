import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    property string label: ""
    property real value: 0
    property string display: String(value)
    property real min: 0
    property real max: 1
    property real step: 0.01
    property bool disabled: false
    property var origin: undefined
    property var resetValue: origin
    signal gestureStarted()
    signal preview(real value)
    signal change(real value)
    signal canceled()
    implicitHeight: Ui.Metrics.compact

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: Ui.Metrics.xs
        anchors.rightMargin: Ui.Metrics.xs
        spacing: Ui.Metrics.md
        Ui.Text {
            Layout.preferredWidth: InspectorTokens.sliderLabelWidth
            text: root.label
            elide: Text.ElideRight
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
        }
        Ui.Slider {
            id: slider
            Layout.fillWidth: true
            density: Ui.EditorButton.Compact
            from: root.min
            to: root.max
            stepSize: root.step
            value: root.value
            origin: root.origin === undefined ? root.min : root.origin
            resetValue: root.resetValue === undefined ? root.value : root.resetValue
            resetOnDoubleTap: true
            enabled: !root.disabled
            accessibleName: root.label
            onEditStarted: root.gestureStarted()
            onValuePreviewed: value => root.preview(value)
            onValueCommitted: value => root.change(value)
            onEditCanceled: root.canceled()
        }
        Ui.Text {
            Layout.preferredWidth: InspectorTokens.sliderValueWidth
            text: root.display
            horizontalAlignment: Text.AlignRight
            role: Ui.Typography.MonoLabel
        }
    }
}
