pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.NodeEditor

ColumnLayout {
    id: root
    required property GenerationReplay generations
    // The tab's MediaResolver, which previews each generation's media.
    property var resolver: null
    readonly property var history: generations.generationHistory
    readonly property var rows: history ? history.rows : []
    readonly property string pinned: generations.pinnedGeneration
    readonly property var replay: generations.replayGenerations
    readonly property bool missingPin: pinned !== "" && history && !history.loading && !rows.some(row => row.id === pinned)
    readonly property bool missingReplay: replay.some(id => !rows.some(row => row.id === id))
    property string inspected: ""
    readonly property string shown: inspected !== "" ? inspected : pinned !== "" ? pinned : rows.length > 0 ? rows[rows.length - 1].id : ""
    function showGeneration(id, index) { inspected = id; Qt.callLater(() => list.positionViewAtIndex(index, ListView.Contain)) }
    spacing: Ui.Metrics.sm
    RowLayout {
        Layout.fillWidth: true
        Layout.leftMargin: Ui.Metrics.lg
        Layout.rightMargin: Ui.Metrics.lg
        NodeButton { objectName: "history-refresh"; text: "Refresh"; enabled: root.history && !root.history.loading; onClicked: root.history.refresh() }
        NodeButton { objectName: "history-latest"; text: "Use latest"; enabled: !root.generations.readOnly && root.pinned !== ""; onClicked: { root.inspected = ""; root.generations.pinGeneration("") } }
        NodeButton { objectName: "history-clear-replay"; text: "Clear replay"; enabled: !root.generations.readOnly && root.replay.length > 0; onClicked: root.generations.clearReplayGenerations() }
    }
    Ui.Text {
        objectName: "history-status"
        Layout.fillWidth: true
        Layout.leftMargin: Ui.Metrics.lg
        Layout.rightMargin: Ui.Metrics.lg
        wrapMode: Text.WrapAnywhere
        role: Ui.Typography.SansCaption
        text: root.history && root.history.loading ? "Loading generations…" : root.history && root.history.error !== "" ? root.history.error : root.missingPin ? "The pinned generation is missing. Choose another generation or use latest." : root.missingReplay ? "A replay generation is missing. Clear replay or choose the available generations again." : root.rows.length === 0 ? "No saved generations for this node." : "Pin a generation for downstream runs. Add replay items in the order they should run."
    }
    ListView {
        id: list
        objectName: "generation-history-list"
        Layout.fillWidth: true
        Layout.fillHeight: true
        clip: true
        spacing: Ui.Metrics.sm
        model: root.rows
        delegate: ColumnLayout {
            id: row
            required property var modelData
            required property int index
            readonly property bool opened: root.shown === modelData.id
            width: ListView.view.width
            spacing: Ui.Metrics.xs
            RowLayout {
                Layout.fillWidth: true
                Layout.leftMargin: Ui.Metrics.lg
                Layout.rightMargin: Ui.Metrics.lg
                Ui.Text { Layout.fillWidth: true; text: row.modelData.created; role: Ui.Typography.SansCaption; elide: Text.ElideRight }
                Ui.Text { visible: root.replay.includes(row.modelData.id); text: "Replay " + (root.replay.indexOf(row.modelData.id) + 1); role: Ui.Typography.SansCaption }
            }
            RowLayout {
                Layout.fillWidth: true
                Layout.leftMargin: Ui.Metrics.lg
                Layout.rightMargin: Ui.Metrics.lg
                NodeButton { objectName: "history-view-" + row.modelData.id; text: row.opened ? "Viewing" : "Preview"; onClicked: root.showGeneration(row.modelData.id, row.index) }
                NodeButton { objectName: "history-pin-" + row.modelData.id; text: root.pinned === row.modelData.id ? "Unpin" : "Pin"; enabled: !root.generations.readOnly; onClicked: { root.showGeneration(row.modelData.id, row.index); root.generations.pinGeneration(root.pinned === row.modelData.id ? "" : row.modelData.id) } }
                NodeButton { objectName: "history-replay-" + row.modelData.id; text: root.replay.includes(row.modelData.id) ? "Remove replay" : "Add replay"; enabled: !root.generations.readOnly; onClicked: root.generations.toggleReplayGeneration(row.modelData.id) }
            }
            Ui.Text { Layout.fillWidth: true; Layout.leftMargin: Ui.Metrics.lg; Layout.rightMargin: Ui.Metrics.lg; visible: row.opened && row.modelData.media.length === 0; text: row.modelData.text; role: Ui.Typography.MonoCaption; wrapMode: Text.WrapAnywhere }
            Ui.Text { Layout.leftMargin: Ui.Metrics.lg; visible: row.opened && row.modelData.truncated; text: "Preview shortened."; role: Ui.Typography.SansCaption }
            Repeater {
                model: row.opened ? row.modelData.media : []
                MediaPreview {
                    required property var modelData
                    required property int index
                    Layout.fillWidth: true
                    Layout.leftMargin: Ui.Metrics.lg
                    Layout.rightMargin: Ui.Metrics.lg
                    mediaKind: modelData.kind
                    locator: modelData.locator
                    requestKey: "generation-" + root.generations.selection + "-" + row.modelData.id + "-" + index
                    resolver: root.resolver
                }
            }
        }
    }
}
