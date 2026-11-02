// The transport's zoom dropdown: Fit, then the fixed levels. The button shows
// the current zoom, which the wheel can leave between levels.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.MenuButton {
    id: button
    required property MonitorViewState monitor
    objectName: "monitorZoomButton"
    density: Ui.EditorButton.Compact
    variant: Ui.EditorButton.Flat
    text: monitor.fit ? "Fit" : Math.round(monitor.zoom * 100) + "%"
    accessibleName: "Monitor zoom " + text
    menu: Ui.ContextMenu {
        id: zoomMenu
        objectName: "monitorZoomMenu"
        popupType: Controls.Popup.Item
        Ui.MenuItem {
            objectName: "monitorZoom_fit"
            text: "Fit"
            checkable: true
            checked: button.monitor.fit
            onTriggered: button.monitor.setFit()
        }
        Instantiator {
            model: [10, 25, 50, 75, 100, 150, 200, 400, 800, 1600]
            onObjectAdded: (index, object) => zoomMenu.addItem(object)
            onObjectRemoved: (index, object) => zoomMenu.removeItem(object)
            delegate: Ui.MenuItem {
                required property int modelData
                objectName: "monitorZoom_" + modelData
                text: modelData + "%"
                checkable: true
                checked: !button.monitor.fit && Math.abs(button.monitor.zoom * 100 - modelData) < 0.01
                onTriggered: button.monitor.setZoomPercent(modelData)
            }
        }
    }
}
