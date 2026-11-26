// One menu for built-in devices and VST3 plug-ins, grouped in "Built-in" and "Plug-ins".
// A search field appears when the list is long. Choosing a row emits `chosen(entry)`.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui
import "DeviceCatalog.js" as Catalog

Ui.Popover {
    id: root
    property var entries: []
    property string rowPrefix: ""
    property string rowSuffix: ""
    property string currentKey: ""
    property string searchLabel: qsTr("Search devices")
    readonly property bool searchable: entries.length > 8
    property var shown: []
    signal chosen(var entry)

    width: Ui.Metrics.xxxl * 8
    height: Math.min(content.implicitHeight + 2 * padding, parent ? parent.height * 0.8 : 480)

    function refresh() { shown = Catalog.filter(entries, search.text) }
    function pick(entry) {
        if (!entry) return
        // A later click owns focus after a choice. Only a canceled menu returns focus to its trigger.
        root.returnFocusTo = null
        root.close()
        root.chosen(entry)
    }
    onEntriesChanged: refresh()
    onAboutToShow: {
        search.text = ""
        refresh()
    }
    onOpened: if (searchable) search.forceActiveFocus(Qt.PopupFocusReason)

    Column {
        id: content
        width: parent.width
        spacing: Ui.Metrics.sm
        Ui.TextField {
            id: search
            objectName: root.rowPrefix + "search" + root.rowSuffix
            visible: root.searchable
            width: parent.width
            leadingIcon: "search"
            clearable: true
            handleReturn: false
            placeholderText: root.searchLabel
            accessibleName: root.searchLabel
            onTextChanged: root.refresh()
            Keys.onReturnPressed: root.pick(Catalog.firstItem(root.shown))
            Keys.onEnterPressed: root.pick(Catalog.firstItem(root.shown))
                    }
        ListView {
            id: list
            objectName: root.rowPrefix + "list" + root.rowSuffix
            width: parent.width
            height: Math.min(contentHeight, Ui.Metrics.xxxl * 16)
            Basic.ScrollBar.vertical: Ui.ScrollBar { }
            clip: true
            reuseItems: true
            cacheBuffer: Ui.Metrics.xxxl * 4
            boundsBehavior: Flickable.StopAtBounds
            model: root.shown
            delegate: Item {
                id: line
                required property var modelData
                readonly property bool header: modelData.kind === "header"
                width: ListView.view.width
                height: header ? Ui.Metrics.compact : row.implicitHeight
                Ui.Text {
                    visible: line.header
                    x: Ui.Metrics.md
                    anchors.verticalCenter: parent.verticalCenter
                    text: line.modelData.label
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Ui.ListRow {
                    id: row
                    visible: !line.header
                    objectName: line.header ? "" : root.rowPrefix + line.modelData.key + root.rowSuffix
                    width: parent.width
                    active: line.modelData.key === root.currentKey
                    accessibleName: line.modelData.label + (line.modelData.detail ? ", " + line.modelData.detail : "")
                    onClicked: root.pick(line.modelData)
                    Ui.Text {
                        id: label
                        width: Math.min(implicitWidth, row.availableWidth * 0.6)
                        elide: Text.ElideRight
                        text: line.modelData.label
                        role: Ui.Typography.SansLabel
                        tone: Ui.Text.Primary
                    }
                    Ui.Text {
                        x: label.width + Ui.Metrics.md
                        width: Math.max(0, row.availableWidth - x)
                        elide: Text.ElideRight
                        text: line.modelData.detail
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        anchors.verticalCenter: label.verticalCenter
                    }
                }
            }
        }
        Ui.Text {
            objectName: root.rowPrefix + "no-match" + root.rowSuffix
            visible: Catalog.firstItem(root.shown) === null
            x: Ui.Metrics.md
            text: qsTr("No devices match")
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
        }
    }
}
