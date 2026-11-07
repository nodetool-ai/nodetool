import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    required property var presenter
    required property int activationToken
    property bool finished: false
    property bool focusedOnce: false
    function activate() {
        field.forceActiveFocus(Qt.MouseFocusReason)
        if (presenter.singleLine) field.selectAll()
        else field.cursorPosition = field.text.length
        resizeEditor()
    }
    function resizeEditor() {
        if (finished) return
        if (!presenter.singleLine) presenter.setEditorHeight(field.implicitHeight, activationToken)
        Qt.callLater(scroller.ensureCaretVisible)
    }
    function finish() {
        if (finished) return
        const draft = field.text
        finished = true
        presenter.commit(draft, activationToken)
    }
    function finishIfBlurred() {
        if (focusedOnce && !field.activeFocus && !finished) finish()
    }
    Item {
        x: root.presenter.editorRect.x
        y: root.presenter.editorRect.y
        width: root.presenter.editorRect.width / root.presenter.zoom
        height: root.presenter.editorRect.height / root.presenter.zoom
        scale: root.presenter.zoom
        transformOrigin: Item.TopLeft
        Flickable {
            id: scroller
            objectName: "inline-title-scroll"
            anchors.fill: parent
            contentWidth: width
            contentHeight: field.height
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            interactive: !root.presenter.singleLine && contentHeight > height
            function ensureCaretVisible() {
                if (root.finished || root.presenter.singleLine) return
                const cursor = field.cursorRectangle
                const top = Math.max(0, cursor.y - Ui.Metrics.xs)
                const bottom = cursor.y + cursor.height + Ui.Metrics.xs
                if (top < contentY) contentY = top
                else if (bottom > contentY + height) contentY = bottom - height
                contentY = Math.max(0, Math.min(contentY, Math.max(0, contentHeight - height)))
            }
            onHeightChanged: Qt.callLater(ensureCaretVisible)
            Basic.ScrollBar.vertical: Ui.ScrollBar { visible: scroller.interactive }
            Ui.TextArea {
                id: field
                objectName: "inline-title-text"
                width: scroller.width
                height: root.presenter.singleLine ? scroller.height : Math.max(scroller.height, implicitHeight)
                value: root.presenter.text
                accessibleName: root.presenter.group ? "Group headline" : root.presenter.reroute ? "Reroute label" : root.presenter.comment ? "Comment text" : root.presenter.header ? "Node title" : "Note text"
                role: root.presenter.group || root.presenter.comment ? Ui.Typography.SansBody : root.presenter.header ? Ui.Typography.SansLabel : Ui.Typography.SansCaption
                font.weight: root.presenter.group ? Font.Medium : Font.Normal
                padding: root.presenter.singleLine ? Ui.Metrics.xs : Ui.Metrics.md
                horizontalAlignment: root.presenter.reroute ? TextEdit.AlignHCenter : TextEdit.AlignLeft
                selectByMouse: true
                wrapMode: root.presenter.singleLine ? TextEdit.NoWrap : TextEdit.Wrap
                onImplicitHeightChanged: Qt.callLater(root.resizeEditor)
                onCursorRectangleChanged: Qt.callLater(scroller.ensureCaretVisible)
                onTextChanged: {
                    if (root.presenter.singleLine && /[\r\n]/.test(text)) {
                        const position = cursorPosition
                        text = text.replace(/[\r\n]/g, "")
                        cursorPosition = Math.min(position, text.length)
                    }
                    Qt.callLater(root.resizeEditor)
                }
                Keys.priority: Keys.BeforeItem
                Keys.onPressed: event => {
                    if (event.key === Qt.Key_Escape) {
                        root.finished = true
                        root.presenter.cancel()
                        event.accepted = true
                    } else if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter)
                               && (root.presenter.comment ? (event.modifiers & (Qt.ControlModifier | Qt.MetaModifier))
                                   : (root.presenter.singleLine || !(event.modifiers & Qt.ShiftModifier)))) {
                        root.finish()
                        event.accepted = true
                    }
                }
                onActiveFocusChanged: {
                    if (activeFocus) root.focusedOnce = true
                    else Qt.callLater(root.finishIfBlurred)
                }
            }
        }
    }
}
