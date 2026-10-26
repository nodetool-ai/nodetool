import QtQuick
import NodeTool.Timeline
Column {
    id: root
    required property ClipInspectorController controller
    property string value: ""
    property string ariaLabel: "Easing"
    property bool hint: true
    property bool disabled: false
    signal change(string value)
    spacing: Theme.spacingMicro
    InspectorRow {
        width: parent.width
        label: "Easing"
        InspectorPillInput {
            minWidth: 140
            value: root.value
            placeholder: "linear"
            allowEmpty: true
            ariaLabel: root.ariaLabel
            disabled: root.disabled
            onCommit: raw => root.change(raw.trim())
        }
    }
    Text {
        width: parent.width
        visible: root.value !== "" && !root.controller.validEasing(root.value)
        text: "Not an easing this build reads; plays linear"
        color: Theme.textSecondary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
        wrapMode: Text.WordWrap
    }
    Text {
        width: parent.width
        visible: root.hint
        text: "linear, easeIn, easeOut, easeInOut, easeOutBack, easeOutElastic, easeOutBounce, cubic-bezier(x1,y1,x2,y2) or spring(stiffness,damping,mass)"
        color: Theme.textSecondary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
        wrapMode: Text.WordWrap
    }
}
