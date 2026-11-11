import QtQuick
import QtQuick.Layouts
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    required property var picker
    property int activationToken: -1
    // One cursor runs over the fixed rows, then the ranked results.
    readonly property var fixedRows: picker.fixedRows
    property int cursor: 0
    readonly property int total: fixedRows.length + list.count
    function resetCursor() {
        cursor = 0
        list.positionViewAtBeginning()
    }
    Connections {
        target: root.picker
        function onChanged() { root.resetCursor() }
    }
    color: Ui.Theme.surfaceOverlay
    radius: Ui.Metrics.radiusOverlay
    border.width: Ui.Metrics.border
    border.color: Ui.Theme.borderControl
    function activate() {
        resetCursor()
        search.forceActiveFocus(Qt.PopupFocusReason)
    }
    function cancel() { picker.dismiss(activationToken) }
    function chooseCurrent() {
        if (cursor >= 0 && cursor < fixedRows.length) {
            picker.choose(fixedRows[cursor].key, activationToken)
            return
        }
        const options = picker.rows
        const index = cursor - fixedRows.length
        if (index >= 0 && index < options.length)
            picker.choose(options[index].key, activationToken)
    }
    function move(delta) {
        cursor = Math.max(0, Math.min(total - 1, cursor + delta))
        if (list.currentIndex >= 0)
            list.positionViewAtIndex(list.currentIndex, ListView.Contain)
    }
    Keys.priority: Keys.BeforeItem
    Keys.onPressed: event => {
        if (event.key === Qt.Key_Escape) { cancel(); event.accepted = true }
    }
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.md
        RowLayout {
            Layout.fillWidth: true
            Ui.Text {
                Layout.fillWidth: true
                text: root.picker.title
                role: Ui.Typography.SansLabel
                elide: Text.ElideRight
            }
            Ui.EditorButton {
                objectName: "compatible-close"
                text: "Cancel"
                variant: Ui.EditorButton.Flat
                density: Ui.EditorButton.Compact
                onClicked: root.cancel()
            }
        }
        Ui.TextField {
            id: search
            objectName: "compatible-search"
            Layout.fillWidth: true
            density: Ui.EditorButton.Compact
            value: root.picker.query
            placeholderText: "Search compatible nodes"
            accessibleName: "Search compatible nodes"
            onValuePreviewed: value => root.picker.search(value, root.activationToken)
            Keys.priority: Keys.BeforeItem
            Keys.onPressed: event => {
                if (event.key === Qt.Key_Down) { root.move(1); event.accepted = true }
                else if (event.key === Qt.Key_Up) { root.move(-1); event.accepted = true }
                else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) { root.chooseCurrent(); event.accepted = true }
                else if (event.key === Qt.Key_Escape) { root.cancel(); event.accepted = true }
            }
        }
        Column {
            objectName: "compatible-fixed"
            Layout.fillWidth: true
            visible: root.fixedRows.length > 0
            spacing: Ui.Metrics.micro
            Repeater {
                model: root.fixedRows
                delegate: Ui.EditorButton {
                    required property var modelData
                    required property int index
                    objectName: modelData.key === "fixed\ndelete-output" ? "compatible-delete-output" : "compatible-fixed-" + index
                    width: parent.width
                    text: modelData.label
                    contentAlignment: Qt.AlignLeft
                    variant: modelData.destructive ? Ui.EditorButton.Destructive : Ui.EditorButton.Flat
                    density: Ui.EditorButton.Compact
                    active: root.cursor === index
                    onHoveredChanged: if (hovered) root.cursor = index
                    onClicked: root.picker.choose(modelData.key, root.activationToken)
                }
            }
        }
        Ui.Separator {
            Layout.fillWidth: true
            visible: root.fixedRows.length > 0
        }
        ListView {
            id: list
            objectName: "compatible-results"
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            model: root.picker.rows
            currentIndex: Math.max(-1, root.cursor - root.fixedRows.length)
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            delegate: Ui.EditorButton {
                id: row
                required property var modelData
                required property int index
                objectName: "compatible-result-" + index
                width: ListView.view.width
                height: Ui.Metrics.xxxl + Ui.Metrics.xl
                variant: Ui.EditorButton.Flat
                active: list.currentIndex === index
                accessibleName: modelData.label + ", " + modelData.portLabel + ", " + modelData.typeLabel
                onHoveredChanged: if (hovered) root.cursor = root.fixedRows.length + index
                onClicked: root.picker.choose(modelData.key, root.activationToken)
                contentItem: Column {
                    spacing: Ui.Metrics.micro
                    Ui.Text { width: parent.width; text: row.modelData.label; role: Ui.Typography.SansLabel; elide: Text.ElideRight }
                    Ui.Text { width: parent.width; text: row.modelData.portLabel + " : " + row.modelData.typeLabel; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; elide: Text.ElideRight }
                }
            }
        }
        Ui.Text {
            Layout.fillWidth: true
            visible: list.count === 0 && root.fixedRows.length === 0
            text: "No compatible nodes match this search."
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            wrapMode: Text.Wrap
        }
    }
}
