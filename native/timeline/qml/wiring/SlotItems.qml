pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline

Item {
    id: host
    required property string slot
    property var slotProperties: ({})
    property bool overlay: false
    property bool vertical: false
    objectName: "slotItems_" + slot
    implicitWidth: overlay ? 0 : childrenRect.width
    implicitHeight: overlay ? 0 : childrenRect.height

    Repeater {
        id: panels
        model: PanelRegistry.forSlot(host.slot)
        delegate: Loader {
            id: panelLoader
            readonly property var panelProperties: host.slotProperties
            required property var modelData
            required property int index
            anchors.fill: host.overlay ? host : null
            width: host.overlay || host.vertical ? host.width : implicitWidth
            x: host.overlay || host.vertical || index === 0 ? 0 : panels.itemAt(index - 1).x + panels.itemAt(index - 1).width
            y: !host.overlay && host.vertical && index > 0 ? panels.itemAt(index - 1).y + panels.itemAt(index - 1).height : 0
            function initialProperties() {
                const properties = {}
                for (const name of Object.keys(panelProperties)) {
                    properties[name] = Qt.binding(() => panelLoader.panelProperties[name])
                }
                return properties
            }
            // A timer the delegate owns, unlike Qt.callLater, dies with it, so a
            // delegate the Repeater drops before the next turn never loads.
            Timer {
                id: loadLater
                interval: 0
                onTriggered: panelLoader.setSource(panelLoader.modelData.source, panelLoader.initialProperties())
            }
            Component.onCompleted: loadLater.start()
        }
    }
}
