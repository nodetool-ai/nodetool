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
    // Too narrow for a useful slider beside its label, the slider takes a line of its own.
    readonly property bool stacked: width > 0 && width < InspectorTokens.sliderStackWidth
    implicitHeight: Ui.Metrics.compact * (stacked ? 2 : 1)

    GridLayout {
        anchors.fill: parent
        anchors.leftMargin: Ui.Metrics.xs
        anchors.rightMargin: Ui.Metrics.xs
        columns: root.stacked ? 2 : 3
        rowSpacing: 0
        columnSpacing: Ui.Metrics.md
        Ui.Text {
            Layout.row: 0
            Layout.column: 0
            Layout.fillWidth: root.stacked
            Layout.preferredWidth: root.stacked ? -1 : InspectorTokens.sliderLabelWidth
            text: root.label
            elide: Text.ElideRight
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
        }
        Ui.Slider {
            id: slider
            Layout.row: root.stacked ? 1 : 0
            Layout.column: root.stacked ? 0 : 1
            Layout.columnSpan: root.stacked ? 2 : 1
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
            Layout.row: 0
            Layout.column: root.stacked ? 1 : 2
            Layout.preferredWidth: InspectorTokens.sliderValueWidth
            text: root.display
            horizontalAlignment: Text.AlignRight
            role: Ui.Typography.MonoLabel
        }
    }
}
