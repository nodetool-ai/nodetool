import QtQuick
import QtQuick.Layouts
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    required property var picker
    required property int activationToken
    color: Ui.Theme.surfaceOverlay
    radius: Ui.Metrics.radiusOverlay
    border.width: Ui.Metrics.border
    border.color: Ui.Theme.borderControl
    function activate() { search.forceActiveFocus(Qt.PopupFocusReason) }
    function cancel() { picker.dismiss(activationToken) }
    function chooseCurrent() {
        const options = picker.rows
        if (list.currentIndex >= 0 && list.currentIndex < options.length)
            picker.choose(options[list.currentIndex].key, activationToken)
    }
    function move(delta) {
        list.currentIndex = Math.max(0, Math.min(list.count - 1, list.currentIndex + delta))
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
        ListView {
            id: list
            objectName: "compatible-results"
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            model: root.picker.rows
            currentIndex: count > 0 ? 0 : -1
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
                onHoveredChanged: if (hovered) list.currentIndex = index
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
            visible: list.count === 0
            text: "No compatible nodes match this search."
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            wrapMode: Text.Wrap
        }
    }
}
