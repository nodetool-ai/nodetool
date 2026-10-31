// TextArea from ClipTextStyleSection. Text prefix matches package I's owns pattern.
// The Inspector primitives have no multiline input.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.TextArea {
    id: root
    required property var editor
    property bool disabled: editor.locked
    enabled: !disabled
    selectByMouse: true
    implicitHeight: Math.max(Ui.Metrics.small * 3, contentHeight + topPadding + bottomPadding)
    role: Ui.Typography.SansLabel
    accessibleName: "Text content"
    Connections {
        target: root.editor
        function onTypingChanged() {
            if (!root.editor.typing) {
                root.editing = false
                root.text = root.value
            }
        }
    }
    onEditStarted: if (!editor.typing) editor.beginTyping()
    onValuePreviewed: value => editor.previewTyping(value)
    onValueCommitted: editor.finishTyping()
    onEditCanceled: editor.cancelTyping()
}
