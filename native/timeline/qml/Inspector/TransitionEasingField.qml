import QtQuick
import NodeTool.Timeline
import "primitives"
import NodeTool.UiPrimitives as Ui

Column {
    id: root
    property string value: ""
    property bool disabled: false
    required property var controller
    signal change(var easing)
    spacing: Ui.Metrics.micro
    InspectorRow {
        width: parent.width
        label: "Easing"
        InspectorPillInput {
            objectName: "transitionEasing"
            value: root.value
            placeholder: "linear"
            allowEmpty: true
            minWidth: Ui.Metrics.touch * 3 + Ui.Metrics.md
            ariaLabel: "Transition easing"
            disabled: root.disabled
            onCommit: raw => root.change(raw.trim() === "" ? null : raw.trim())
        }
    }
    Ui.Text {
        objectName: "transitionEasingWarning"
        width: parent.width
        visible: root.value !== "" && !root.controller.easingReadable(root.value)
        text: "This build cannot read this easing; it will play as linear."
        wrapMode: Text.WordWrap
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Secondary
    }
    Ui.Text {
        objectName: "transitionEasingHint"
        width: parent.width
        text: "Use linear, easeIn, easeOut, easeInOut, easeOutBack, easeOutElastic, easeOutBounce, cubic-bezier(x1,y1,x2,y2), or spring(stiffness,damping,mass)."
        wrapMode: Text.WordWrap
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Secondary
    }
}
