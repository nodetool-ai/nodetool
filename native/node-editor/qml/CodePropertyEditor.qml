import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    required property string value
    required property bool writable
    property string nodeType: ""
    property bool expanded: false
    signal editCanceled()
    signal editStarted()
    signal valueCommitted(string value)
    function focusEditor() { editor.forceActiveFocus(Qt.MouseFocusReason) }
    function finishEdit() { editor.finishEdit() }
    function cancelEdit() { editor.cancelEdit() }
    function resetScope() { editor.cancelEdit(); expanded = false }
    spacing: Ui.Metrics.xs
    RowLayout {
        Layout.fillWidth: true
        NodeButton {
            objectName: "code-expand"
            text: root.expanded ? "Collapse editor" : "Expand editor"
            visible: root.nodeType !== "nodetool.code.Code"
            onClicked: root.expanded = !root.expanded
        }
        NodeButton { text: "Copy"; onClicked: { editor.selectAll(); editor.copy(); editor.deselect() } }
    }
    Rectangle {
        Layout.fillWidth: true
        Layout.fillHeight: true
        implicitHeight: root.expanded ? Ui.Metrics.touch * 12 : Ui.Metrics.touch * 6
        color: Ui.Theme.surfaceInput
        border.color: editor.activeFocus ? Ui.Theme.borderFocus : Ui.Theme.borderControl
        border.width: Ui.Metrics.border
        radius: Ui.Metrics.radiusControl
        clip: true
        Flickable {
            id: scroll
            anchors.fill: parent
            anchors.margins: Ui.Metrics.xs
            contentWidth: Math.max(width, editor.contentWidth + gutter.width + Ui.Metrics.xl)
            contentHeight: editor.height
            boundsBehavior: Flickable.StopAtBounds
            // Only visible line labels exist, even for large source documents.
            Item {
                id: gutter
                width: Ui.Metrics.touch
                height: editor.height
                Repeater {
                    model: Math.ceil(scroll.height / editor.font.pixelSize) + 2
                    Ui.Text {
                        required property int index
                        readonly property int line: Math.floor(scroll.contentY / editor.cursorRectangle.height) + index
                        visible: line < editor.lineCount
                        text: String(line + 1)
                        y: line * editor.cursorRectangle.height + editor.topPadding
                        width: gutter.width - Ui.Metrics.md
                        horizontalAlignment: Text.AlignRight
                        role: Ui.Typography.MonoCode
                        tone: Ui.Text.Secondary
                    }
                }
            }
            Ui.TextArea {
                id: editor
                objectName: "code-editor"
                x: gutter.width
                width: Math.max(scroll.width - gutter.width, contentWidth + Ui.Metrics.xl)
                height: Math.max(scroll.height, contentHeight + Ui.Metrics.xl)
                value: root.value
                enabled: root.writable
                role: Ui.Typography.MonoCode
                variant: Ui.TextArea.Plain
                wrapMode: TextEdit.NoWrap
                selectByMouse: true
                accessibleName: "Code"
                onEditCanceled: root.editCanceled()
                onEditStarted: root.editStarted()
                onValueCommitted: value => root.valueCommitted(value)
                Keys.onPressed: event => {
                    if (event.key === Qt.Key_Tab) {
                        if (!editing) { editBaseline = value; editing = true; editStarted() }
                        if (selectionStart !== selectionEnd) remove(selectionStart, selectionEnd)
                        insert(cursorPosition, "  "); event.accepted = true
                    }
                    else if (event.key === Qt.Key_Escape) { cancelEdit(); event.accepted = true }
                }
                onCursorRectangleChanged: {
                    if (cursorRectangle.y < scroll.contentY) scroll.contentY = cursorRectangle.y
                    else if (cursorRectangle.y + cursorRectangle.height > scroll.contentY + scroll.height)
                        scroll.contentY = cursorRectangle.y + cursorRectangle.height - scroll.height
                }
                // Highlighting is optional: a fixture without the registered module still edits text.
                Loader {
                    source: "CodeSyntax.qml"
                    onLoaded: item.target = Qt.binding(() => root.nodeType === "nodetool.code.Code" || root.nodeType.startsWith("nodetool.manimgx.") ? editor.textDocument : null)
                }
            }
        }
    }
}
