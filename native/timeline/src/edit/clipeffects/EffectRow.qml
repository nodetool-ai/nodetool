pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Layouts
import NodeTool.Timeline
import "ClipEffectsCatalog.js" as Catalog
import "../inspectorsections" as Sections

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
        spacing: Theme.spacingXs
        topPadding: Theme.spacingMd
        Rectangle {
            width: parent.width
            height: 1
            color: Theme.divider
        }
        RowLayout {
            width: parent.width
            spacing: Theme.spacingMicro
            Sections.InspectorActionButton {
                id: reorder
                objectName: "effectsReorder_" + root.effectId
                implicitWidth: Theme.controlXs
                implicitHeight: Theme.controlXs
                text: "⠿"
                outlined: false
                enabled: !root.editor.locked
                Accessible.name: "Reorder " + root.name
                Controls.ToolTip.visible: hovered
                Controls.ToolTip.text: "Drag to reorder, or use Alt + arrow keys"
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
            Controls.CheckBox {
                id: activation
                objectName: "effectsEnabled_" + root.effectId
                checked: root.effect.enabled ?? false
                enabled: !root.editor.locked
                implicitWidth: Theme.controlXs
                implicitHeight: Theme.controlXs
                padding: 0
                Accessible.name: root.name + " enabled"
                indicator: Rectangle {
                    width: Theme.fontSizeSmall
                    height: width
                    x: (activation.width - width) / 2
                    y: (activation.height - height) / 2
                    radius: Theme.radiusXs
                    border.width: 1
                    border.color: Theme.overlayStrong
                    color: activation.checked ? Theme.primary : "transparent"
                    Text {
                        anchors.centerIn: parent
                        text: activation.checked ? "✓" : ""
                        color: Theme.textPrimary
                        font.pixelSize: Theme.fontSizeSmaller
                    }
                }
                onClicked: root.editor.patch(root.effectId, {
                    enabled: checked
                })
            }
            Sections.InspectorActionButton {
                objectName: "effectsExpand_" + root.effectId
                Layout.fillWidth: true
                outlined: false
                text: (root.expanded ? "⌄ " : "› ") + root.name
                Accessible.name: root.name
                contentItem: Text {
                    text: parent.text
                    font: parent.font
                    elide: Text.ElideRight
                    color: root.effect.enabled ? Theme.textPrimary : Theme.textSecondary
                    verticalAlignment: Text.AlignVCenter
                }
                onClicked: root.expand()
            }
            Sections.InspectorActionButton {
                objectName: "effectsRemove_" + root.effectId
                implicitWidth: Theme.controlXs
                outlined: false
                text: "×"
                enabled: !root.editor.locked
                Accessible.name: "Remove " + root.name + " effect"
                Controls.ToolTip.visible: hovered
                Controls.ToolTip.text: Accessible.name
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
