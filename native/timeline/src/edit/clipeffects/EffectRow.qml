pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Layouts
import NodeTool.Timeline
import "ClipEffectsCatalog.js" as Catalog
import "../inspectorsections" as Sections
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    required property var editor
    required property string effectId
    property bool expanded: false
    readonly property var effect: editor.effects.find(effect => effect.id === effectId) || ({})
    readonly property string name: Catalog.name(effect.type || "")
    signal expand
    objectName: "effectRow_" + effectId
    implicitHeight: content.implicitHeight
    Column {
        id: content
        width: parent.width
        spacing: Ui.Metrics.xs
        topPadding: Ui.Metrics.md
        Ui.Separator { width: parent.width }
        RowLayout {
            width: parent.width
            spacing: Ui.Metrics.xs
            Ui.ToolbarIconButton {
                id: reorder
                objectName: "effectsReorder_" + root.effectId
                iconName: "dragIndicator"
                enabled: !root.editor.locked
                accessibleName: "Reorder " + root.name
                description: "Drag to reorder, or use Alt + arrow keys"
                Keys.onPressed: event => {
                    if ((event.modifiers & Qt.AltModifier) && (event.key === Qt.Key_Up || event.key === Qt.Key_Down)) {
                        root.editor.move(root.effectId, event.key === Qt.Key_Up ? -1 : 1);
                        event.accepted = true;
                    }
                }
                Item {
                    id: proxy
                    width: reorder.width
                    height: reorder.height
                    Drag.active: drag.drag.active
                    Drag.source: root
                    Drag.keys: ["clip-effect"]
                    Drag.hotSpot.x: width / 2
                    Drag.hotSpot.y: height / 2
                }
                MouseArea {
                    id: drag
                    anchors.fill: parent
                    drag.target: proxy
                    onPressed: reorder.forceActiveFocus()
                    onReleased: {
                        proxy.Drag.drop();
                        proxy.x = 0;
                        proxy.y = 0;
                    }
                    onCanceled: {
                        proxy.Drag.cancel();
                        proxy.x = 0;
                        proxy.y = 0;
                    }
                }
            }
            Ui.CheckBox {
                id: activation
                objectName: "effectsEnabled_" + root.effectId
                Binding { target: activation; property: "checked"; value: root.effect.enabled ?? false }
                enabled: !root.editor.locked
                accessibleName: root.name + " enabled"
                onCheckedChangedByUser: checked => root.editor.patch(root.effectId, {
                    enabled: checked
                })
            }
            Ui.EditorButton {
                objectName: "effectsExpand_" + root.effectId
                Layout.fillWidth: true
                variant: Ui.EditorButton.Flat
                density: Ui.EditorButton.Compact
                contentAlignment: Qt.AlignLeft
                text: root.name
                trailingIconName: root.expanded ? "arrowDropDown" : "navigateNext"
                textTone: root.effect.enabled ? Ui.Text.Primary : Ui.Text.Secondary
                accessibleName: root.name
                onClicked: root.expand()
            }
            Ui.ToolbarIconButton {
                objectName: "effectsRemove_" + root.effectId
                iconName: "close"
                enabled: !root.editor.locked
                accessibleName: "Remove " + root.name + " effect"
                onClicked: root.editor.remove(root.effectId)
            }
        }
        Loader {
            width: parent.width
            active: root.expanded
            visible: active
            height: active && item ? item.implicitHeight : 0
            sourceComponent: EffectFields {
                editor: root.editor
                effectId: root.effectId
            }
        }
    }
    DropArea {
        anchors.fill: parent
        keys: ["clip-effect"]
        onDropped: drop => {
            if (drop.source && !root.editor.locked) {
                root.editor.drop(drop.source.effectId, root.effectId);
                drop.acceptProposedAction();
            }
        }
    }
}
