import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// Picks the script or storyboard a timeline panel shows. The list comes from
// its own controller, so the open document stays loaded while it browses.
Ui.Dialog {
    id: dialog
    objectName: "linkDocumentDialog"
    property var controller: null
    property string kind: "scripts"
    property string currentId: ""
    property string chosenId: ""
    readonly property bool scripts: kind === "scripts"
    readonly property string noun: scripts ? "script" : "storyboard"
    readonly property var rows: {
        const result = controller ? controller.result : null
        if (!result || typeof result.length !== "number") return []
        const needle = search.text.trim().toLowerCase()
        const list = Array.from(result).filter(row => !needle || (row.name || "").toLowerCase().includes(needle))
        list.sort((a, b) => (Date.parse(b.updatedAt || "") || 0) - (Date.parse(a.updatedAt || "") || 0))
        return list
    }
    signal picked(string id)
    signal createRequested()

    function updated(value) {
        const date = new Date(value || "")
        if (!Number.isFinite(date.getTime())) return ""
        const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000))
        if (days < 1) return "Edited today"
        if (days < 2) return "Edited yesterday"
        if (days < 30) return "Edited " + days + " days ago"
        return "Edited " + date.toLocaleDateString(Qt.locale(), Locale.ShortFormat)
    }
    function confirm() {
        if (chosenId === "" || chosenId === currentId) { close(); return }
        picked(chosenId)
        close()
    }

    title: scripts ? "Link a script" : "Choose a storyboard"
    width: Math.min(Ui.Metrics.dialogCompactWidth, parent ? parent.width - 2 * Ui.Metrics.xl : Ui.Metrics.dialogCompactWidth)
    height: Math.min(Ui.Metrics.dialogWidth, parent ? Math.max(0, parent.height - 4 * Ui.Metrics.xl) : Ui.Metrics.dialogWidth)
    focus: true
    closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
    onOpened: {
        search.clear()
        chosenId = currentId
        if (controller) controller.listContextResources(kind)
        search.forceActiveFocus()
    }
    header: Item {
        implicitHeight: titleColumn.implicitHeight + 2 * Ui.Metrics.lg
        Column {
            id: titleColumn
            x: Ui.Metrics.xl
            width: parent.width - 2 * Ui.Metrics.xl - Ui.Metrics.compact
            anchors.verticalCenter: parent.verticalCenter
            spacing: Ui.Metrics.xs
            Ui.Text { text: dialog.title; role: Ui.Typography.SansTitle; Accessible.role: Accessible.Heading }
            Ui.Text {
                width: parent.width
                text: dialog.scripts ? "The script panel shows the lines of the linked script." : "The storyboard panel shows the shots of this board."
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                wrapMode: Text.WordWrap
            }
        }
        Ui.ToolbarIconButton {
            anchors.right: parent.right
            anchors.rightMargin: Ui.Metrics.xl
            anchors.verticalCenter: parent.verticalCenter
            iconName: "close"
            accessibleName: "Close"
            onClicked: dialog.close()
        }
        Ui.Separator { anchors.bottom: parent.bottom; width: parent.width }
    }
    contentItem: ColumnLayout {
        spacing: Ui.Metrics.md
        Ui.TextField {
            id: search
            objectName: "linkDocumentSearch"
            Layout.fillWidth: true
            selectByMouse: true
            placeholderText: dialog.scripts ? "Search scripts" : "Search storyboards"
            Accessible.name: placeholderText
            Keys.onDownPressed: list.forceActiveFocus()
            Keys.onReturnPressed: dialog.confirm()
        }
        Ui.Surface {
            Layout.fillWidth: true
            Layout.fillHeight: true
            variant: Ui.Surface.Canvas
            clip: true
            ListView {
                id: list
                objectName: "linkDocumentList"
                anchors.fill: parent
                anchors.margins: Ui.Metrics.xs
                spacing: Ui.Metrics.micro
                clip: true
                model: dialog.rows
                keyNavigationEnabled: true
                currentIndex: dialog.rows.findIndex(row => row.id === dialog.chosenId)
                onCurrentIndexChanged: if (currentIndex >= 0 && activeFocus) dialog.chosenId = dialog.rows[currentIndex].id
                Keys.onReturnPressed: dialog.confirm()
                ScrollBar.vertical: Ui.ScrollBar {}
                delegate: Ui.ListRow {
                    id: row
                    required property var modelData
                    width: ListView.view.width
                    objectName: "linkDocument_" + modelData.id
                    accessibleName: (modelData.name || "Untitled " + dialog.noun) + (linked ? ", linked" : "")
                    readonly property bool linked: modelData.id === dialog.currentId
                    active: modelData.id === dialog.chosenId
                    onClicked: dialog.chosenId = modelData.id
                    onDoubleClicked: { dialog.chosenId = modelData.id; dialog.confirm() }
                    RowLayout {
                        width: row.availableWidth
                        spacing: Ui.Metrics.md
                        Ui.Icon { name: dialog.scripts ? "subtitles" : "gridGoldenratio"; tone: row.active ? Ui.Text.Primary : Ui.Text.Secondary }
                        Column {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.micro
                            Ui.Text { width: parent.width; text: row.modelData.name || "Untitled " + dialog.noun; role: Ui.Typography.SansBody; elide: Text.ElideRight }
                            Ui.Text { width: parent.width; text: dialog.updated(row.modelData.updatedAt); visible: text !== ""; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                        }
                        Ui.Text { visible: row.linked; text: dialog.scripts ? "Linked" : "Current"; role: Ui.Typography.SansCaption; tone: Ui.Text.Info }
                        Ui.Icon { visible: row.active; name: "check"; tone: Ui.Text.Info }
                    }
                }
            }
            Column {
                anchors.centerIn: parent
                width: parent.width - 2 * Ui.Metrics.xl
                spacing: Ui.Metrics.sm
                visible: list.count === 0
                Ui.BusyIndicator { anchors.horizontalCenter: parent.horizontalCenter; running: !!dialog.controller && dialog.controller.busy; visible: running }
                Ui.Text {
                    objectName: "linkDocumentMessage"
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansBody
                    tone: dialog.controller && dialog.controller.error ? Ui.Text.Error : Ui.Text.Secondary
                    text: !dialog.controller ? "" : dialog.controller.busy ? "Loading " + dialog.kind + "…"
                        : dialog.controller.error ? dialog.controller.error
                        : search.text.trim() ? "No " + dialog.kind + " match \"" + search.text.trim() + "\"."
                        : "This project has no " + dialog.kind + " yet."
                }
            }
        }
    }
    footer: Item {
        implicitHeight: buttons.implicitHeight + 2 * Ui.Metrics.lg
        Ui.Separator { width: parent.width }
        Ui.EditorButton {
            objectName: "linkDocumentNew"
            visible: dialog.scripts
            x: Ui.Metrics.xl
            anchors.verticalCenter: parent.verticalCenter
            text: "New script"
            iconName: "add"
            variant: Ui.EditorButton.Flat
            onClicked: { dialog.createRequested(); dialog.close() }
        }
        Row {
            id: buttons
            anchors.right: parent.right
            anchors.rightMargin: Ui.Metrics.xl
            anchors.verticalCenter: parent.verticalCenter
            spacing: Ui.Metrics.md
            Ui.EditorButton { text: "Cancel"; onClicked: dialog.close() }
            Ui.EditorButton {
                objectName: "linkDocumentConfirm"
                text: dialog.scripts ? "Link script" : "Show storyboard"
                variant: Ui.EditorButton.Primary
                enabled: dialog.chosenId !== "" && dialog.chosenId !== dialog.currentId
                onClicked: dialog.confirm()
            }
        }
    }
}
