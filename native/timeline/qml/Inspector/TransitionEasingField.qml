import QtQuick
import NodeTool.Timeline
import "primitives"

Column {
    id: root
    property string value: ""
    property bool disabled: false
    required property var controller
    signal change(var easing)
    spacing: Theme.spacingMicro
    InspectorRow {
        width: parent.width
        label: "Easing"
        InspectorPillInput {
            objectName: "transitionEasing"
            value: root.value
            placeholder: "linear"
            allowEmpty: true
            minWidth: 140
            ariaLabel: "Transition easing"
            disabled: root.disabled
            onCommit: raw => root.change(raw.trim() === "" ? null : raw.trim())
        }
    }
    Text {
        objectName: "transitionEasingWarning"
        width: parent.width
        visible: root.value !== "" && !root.controller.easingReadable(root.value)
        text: "This build cannot read this easing; it will play as linear."
        wrapMode: Text.WordWrap
        color: Theme.textSecondary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmaller
    }
    Text {
        objectName: "transitionEasingHint"
        width: parent.width
        text: "Use linear, easeIn, easeOut, easeInOut, easeOutBack, easeOutElastic, easeOutBounce, cubic-bezier(x1,y1,x2,y2), or spring(stiffness,damping,mass)."
        wrapMode: Text.WordWrap
        color: Theme.textSecondary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmaller
    }
}
