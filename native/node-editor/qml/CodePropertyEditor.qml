import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The source editor of a code property: a line gutter, highlighting, the
// current line, auto-indent, block indent and outdent, line comments and
// bracket pairs. On the canvas (canvas: true) it covers the card's code field
// exactly: the font and offsets match paintCodeField in EditorScene.cpp and
// the code metrics in NodeLayout.h, so opening it moves no text.
ColumnLayout {
    id: root
    required property string value
    required property bool writable
    property string nodeType: ""
    property bool canvas: false
    property bool expanded: false
    // NodeLayout.h codeFontSize, codePaddingY, codeGutterWidth and codeTextGap.
    readonly property int codeFontSize: 12
    readonly property int codePaddingY: 6
    readonly property int gutterWidth: 32
    readonly property int textGap: 8
    readonly property string indentUnit: "  "
    readonly property string commentPrefix: nodeType.startsWith("nodetool.manimgx.") || nodeType.indexOf("python") >= 0 ? "# " : "// "
    readonly property real lineHeight: Math.max(1, editor.positionToRectangle(0).height)
    signal editCanceled()
    signal editStarted()
    signal valueCommitted(string value)
    function focusEditor() { editor.forceActiveFocus(Qt.MouseFocusReason) }
    function finishEdit() { editor.finishEdit() }
    function cancelEdit() { editor.cancelEdit() }
    function resetScope() { editor.cancelEdit(); expanded = false }
    spacing: Ui.Metrics.xs
    EditorRoles { id: roles }

    RowLayout {
        Layout.fillWidth: true
        visible: !root.canvas
        NodeButton {
            objectName: "code-expand"
            text: root.expanded ? "Collapse editor" : "Expand editor"
            visible: root.nodeType !== "nodetool.code.Code"
            onClicked: root.expanded = !root.expanded
        }
        NodeButton { text: "Copy"; onClicked: { editor.selectAll(); editor.copy(); editor.deselect() } }
    }
    Rectangle {
        objectName: "code-frame"
        Layout.fillWidth: true
        Layout.fillHeight: true
        implicitHeight: root.expanded ? Ui.Metrics.touch * 12 : Ui.Metrics.touch * 6
        // The transparent overlay sits on the painted field, so the canvas
        // variant paints the card color under the field tint.
        color: root.canvas ? roles.node : Ui.Theme.surfaceInput
        radius: root.canvas ? 6 : Ui.Metrics.radiusControl
        clip: true
        Rectangle {
            anchors.fill: parent
            radius: parent.radius
            color: root.canvas ? roles.field : "transparent"
            border.width: Ui.Metrics.border
            border.color: editor.activeFocus ? Ui.Theme.borderFocus : root.canvas ? "transparent" : Ui.Theme.borderControl
            z: 2
        }
        Flickable {
            id: scroll
            anchors.fill: parent
            contentWidth: Math.max(width, editor.x + editor.contentWidth + root.textGap * 2)
            contentHeight: editor.height
            boundsBehavior: Flickable.StopAtBounds
            clip: true
            // The current line, under the text.
            Rectangle {
                objectName: "code-current-line"
                visible: editor.activeFocus && editor.selectionStart === editor.selectionEnd
                x: 0
                y: editor.cursorRectangle.y
                width: scroll.contentWidth
                height: root.lineHeight
                color: Ui.Theme.actionHover
            }
            // Only the visible line numbers exist, even for large sources.
            Item {
                id: gutter
                width: root.gutterWidth
                height: editor.height
                Repeater {
                    model: Math.ceil(scroll.height / root.lineHeight) + 2
                    Text {
                        required property int index
                        readonly property int line: Math.max(0, Math.floor((scroll.contentY - editor.topPadding) / root.lineHeight)) + index
                        visible: line < editor.lineCount
                        text: String(line + 1)
                        x: 0
                        y: editor.topPadding + line * root.lineHeight
                        width: root.gutterWidth - root.textGap / 2
                        height: root.lineHeight
                        horizontalAlignment: Text.AlignRight
                        verticalAlignment: Text.AlignVCenter
                        font: editor.font
                        color: line === editor.cursorLine && editor.activeFocus ? Ui.Theme.textPrimary : Ui.Theme.textSecondary
                    }
                }
            }
            Ui.TextArea {
                id: editor
                objectName: "code-editor"
                readonly property int cursorLine: text.substring(0, cursorPosition).split("\n").length - 1
                x: root.gutterWidth + root.textGap
                width: Math.max(scroll.width - x, contentWidth + root.textGap)
                height: Math.max(scroll.height, contentHeight + topPadding + bottomPadding)
                topPadding: root.codePaddingY
                bottomPadding: root.codePaddingY
                leftPadding: 0
                rightPadding: 0
                value: root.value
                enabled: root.writable
                role: Ui.Typography.MonoCode
                font.pixelSize: root.canvas ? root.codeFontSize : Ui.Typography.pixelSize(Ui.Typography.MonoCode)
                font.hintingPreference: Font.PreferNoHinting
                variant: Ui.TextArea.Plain
                wrapMode: TextEdit.NoWrap
                selectByMouse: true
                persistentSelection: true
                accessibleName: "Code"
                onEditCanceled: root.editCanceled()
                onEditStarted: root.editStarted()
                onValueCommitted: value => root.valueCommitted(value)
                function beginEdit() {
                    if (!editing) { editBaseline = value; editing = true; editStarted() }
                }
                function lineStart(position) { return text.lastIndexOf("\n", position - 1) + 1 }
                // Replaces the whole lines under the selection through one edit.
                function editLines(transform) {
                    const start = lineStart(Math.min(selectionStart, selectionEnd))
                    const endBreak = text.indexOf("\n", Math.max(selectionStart, selectionEnd - (selectionEnd > selectionStart ? 1 : 0)))
                    const end = endBreak < 0 ? text.length : endBreak
                    const lines = text.substring(start, end).split("\n")
                    const changed = transform(lines).join("\n")
                    const caret = cursorPosition
                    const single = selectionStart === selectionEnd
                    beginEdit()
                    remove(start, end)
                    insert(start, changed)
                    if (single) cursorPosition = Math.max(start, Math.min(start + changed.length, caret + changed.length - (end - start)))
                    else select(start, start + changed.length)
                }
                function toggleComment() {
                    const prefix = root.commentPrefix
                    const bare = prefix.trim()
                    editLines(lines => {
                        const filled = lines.filter(line => line.trim() !== "")
                        const commented = filled.length > 0 && filled.every(line => line.replace(/^\s+/, "").startsWith(bare))
                        return lines.map(line => {
                            if (line.trim() === "") return line
                            const indent = line.length - line.replace(/^\s+/, "").length
                            if (!commented) return line.substring(0, indent) + prefix + line.substring(indent)
                            const rest = line.substring(indent)
                            return line.substring(0, indent) + rest.substring(rest.startsWith(prefix) ? prefix.length : bare.length)
                        })
                    })
                }
                function newLine() {
                    const start = lineStart(cursorPosition)
                    const before = text.substring(start, cursorPosition)
                    const indent = before.match(/^[ \t]*/)[0]
                    const opener = /[{\[(:]\s*$/.test(before)
                    const closer = /^[}\])]/.test(text.substring(cursorPosition, cursorPosition + 1))
                    beginEdit()
                    if (selectionStart !== selectionEnd) remove(selectionStart, selectionEnd)
                    if (opener && closer) {
                        insert(cursorPosition, "\n" + indent + root.indentUnit + "\n" + indent)
                        cursorPosition -= indent.length + 1
                    } else {
                        insert(cursorPosition, "\n" + indent + (opener ? root.indentUnit : ""))
                    }
                }
                Keys.onPressed: event => {
                    const command = event.modifiers & (Qt.ControlModifier | Qt.MetaModifier)
                    const pairs = { "(": ")", "[": "]", "{": "}", "\"": "\"", "'": "'", "`": "`" }
                    if (event.key === Qt.Key_Escape) { cancelEdit(); event.accepted = true }
                    else if (event.key === Qt.Key_Tab && selectionStart !== selectionEnd) {
                        editLines(lines => lines.map(line => root.indentUnit + line)); event.accepted = true
                    } else if (event.key === Qt.Key_Tab) {
                        beginEdit()
                        insert(cursorPosition, root.indentUnit); event.accepted = true
                    } else if (event.key === Qt.Key_Backtab) {
                        editLines(lines => lines.map(line => line.startsWith(root.indentUnit) ? line.substring(root.indentUnit.length) : line.replace(/^[ \t]/, "")))
                        event.accepted = true
                    } else if (command && event.key === Qt.Key_Slash) {
                        toggleComment(); event.accepted = true
                    } else if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && !command && !(event.modifiers & Qt.ShiftModifier)) {
                        newLine(); event.accepted = true
                    } else if (!command && event.text.length === 1 && ")]}\"'`".indexOf(event.text) >= 0
                               && selectionStart === selectionEnd && text.charAt(cursorPosition) === event.text) {
                        cursorPosition += 1; event.accepted = true
                    } else if (!command && event.text.length === 1 && pairs[event.text] !== undefined) {
                        const close = pairs[event.text]
                        const next = text.charAt(cursorPosition)
                        const quote = close === event.text
                        // A quote pairs only before a space, a closer or the end of the line.
                        if (selectionStart === selectionEnd && (!quote || next === "" || /[\s)\]},;]/.test(next))) {
                            beginEdit()
                            insert(cursorPosition, event.text + close)
                            cursorPosition -= 1
                            event.accepted = true
                        }
                    } else if (event.key === Qt.Key_Backspace && selectionStart === selectionEnd && cursorPosition > 0) {
                        const open = text.charAt(cursorPosition - 1)
                        if (pairs[open] !== undefined && text.charAt(cursorPosition) === pairs[open]) {
                            beginEdit()
                            remove(cursorPosition - 1, cursorPosition + 1)
                            event.accepted = true
                        }
                    }
                }
                onCursorRectangleChanged: {
                    if (cursorRectangle.y < scroll.contentY) scroll.contentY = cursorRectangle.y
                    else if (cursorRectangle.y + cursorRectangle.height > scroll.contentY + scroll.height)
                        scroll.contentY = cursorRectangle.y + cursorRectangle.height - scroll.height
                    const right = x + cursorRectangle.x
                    if (right < scroll.contentX + x) scroll.contentX = Math.max(0, right - x)
                    else if (right + root.textGap > scroll.contentX + scroll.width) scroll.contentX = right + root.textGap - scroll.width
                }
                // Highlighting is optional: a fixture without the registered module still edits text.
                Loader {
                    source: "CodeSyntax.qml"
                    onLoaded: item.target = editor.textDocument
                }
            }
        }
    }
}
