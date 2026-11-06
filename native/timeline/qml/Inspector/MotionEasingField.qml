import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
Column {
    id: root
    required property ClipInspectorController controller
    property string value: ""
    property string ariaLabel: "Easing"
    property bool hint: true
    property bool disabled: false
    signal change(string value)
    spacing: Ui.Metrics.micro
    InspectorRow {
        width: parent.width
        label: "Easing"
        InspectorPillInput {
            minWidth: Ui.Metrics.touch * 3 + Ui.Metrics.md
            value: root.value
            placeholder: "linear"
            allowEmpty: true
            ariaLabel: root.ariaLabel
            disabled: root.disabled
            onCommit: raw => root.change(raw.trim())
        }
    }
    Ui.Text {
        width: parent.width
        visible: root.value !== "" && !root.controller.validEasing(root.value)
        text: "Not an easing this build reads; plays linear"
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Secondary
        wrapMode: Text.WordWrap
    }
    Ui.Text {
        width: parent.width
        visible: root.hint
        text: "linear, easeIn, easeOut, easeInOut, easeOutBack, easeOutElastic, easeOutBounce, cubic-bezier(x1,y1,x2,y2) or spring(stiffness,damping,mass)"
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Secondary
        wrapMode: Text.WordWrap
    }
}
