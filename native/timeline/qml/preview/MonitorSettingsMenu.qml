// The Program monitor's wrench menu: display mode, resolutions, overlays and
// guides. Everything here is view state, so nothing changes the document, undo,
// --stills or export.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.ContextMenu {
    id: root
    required property MonitorViewState monitor
    required property var views
    objectName: "monitorSettingsMenu"
    popupType: Controls.Popup.Item

    component ResolutionMenu: Ui.ContextMenu {
        id: resolutionMenu
        required property string prefix
        required property int current
        signal chosen(int denominator)
        popupType: Controls.Popup.Item
        // A submenu cascades from its parent item, which Qt sets. The overlay would place it at the window's edge.
        parent: null
        Instantiator {
            model: [{label: "Full", denominator: 1}, {label: "1/2", denominator: 2},
                    {label: "1/4", denominator: 4}, {label: "1/8", denominator: 8}]
            onObjectAdded: (index, object) => resolutionMenu.addItem(object)
            onObjectRemoved: (index, object) => resolutionMenu.removeItem(object)
            delegate: Ui.MenuItem {
                required property var modelData
                objectName: resolutionMenu.prefix + modelData.denominator
                text: modelData.label
                checkable: true
                checked: resolutionMenu.current === modelData.denominator
                onTriggered: resolutionMenu.chosen(modelData.denominator)
            }
        }
    }
    component ToggleItem: Ui.MenuItem { checkable: true }
    component Divider: Controls.MenuSeparator { contentItem: Ui.Separator {} }

    Ui.ContextMenu {
        id: displayMenu
        objectName: "monitorDisplayMenu"
        title: "Display mode"
        popupType: Controls.Popup.Item
        parent: null
        Ui.MenuItem {
            objectName: "monitorDisplay_composite"
            text: "Composite"
            checkable: true
            checked: root.monitor.displayMode === "composite"
            onTriggered: root.monitor.displayMode = "composite"
        }
        Ui.MenuItem {
            objectName: "monitorDisplay_alpha"
            text: "Alpha"
            checkable: true
            checked: root.monitor.displayMode === "alpha"
            onTriggered: root.monitor.displayMode = "alpha"
        }
        Instantiator {
            model: root.views
            onObjectAdded: (index, object) => displayMenu.addItem(object)
            onObjectRemoved: (index, object) => displayMenu.removeItem(object)
            delegate: Ui.MenuItem {
                required property var modelData
                objectName: "monitorDisplay_" + modelData.id
                text: modelData.title
                checkable: true
                checked: root.monitor.displayMode === modelData.id
                onTriggered: root.monitor.displayMode = modelData.id
            }
        }
    }
    Ui.MenuItem {
        objectName: "monitorSetReference"
        text: "Set reference frame"
        enabled: root.monitor.owner !== null
        onTriggered: root.monitor.owner.runAction("setReferenceFrame", {})
    }
    Divider {}
    ResolutionMenu {
        objectName: "monitorPlaybackResolutionMenu"
        title: "Playback resolution"
        prefix: "monitorPlaybackResolution_"
        current: root.monitor.playbackResolution
        onChosen: denominator => root.monitor.playbackResolution = denominator
    }
    ResolutionMenu {
        objectName: "monitorPausedResolutionMenu"
        title: "Paused resolution"
        prefix: "monitorPausedResolution_"
        current: root.monitor.pausedResolution
        onChosen: denominator => root.monitor.pausedResolution = denominator
    }
    Divider {}
    ToggleItem {
        objectName: "monitorShowControls"
        text: "Show controls"
        checked: root.monitor.showControls
        onTriggered: root.monitor.showControls = checked
    }
    ToggleItem {
        objectName: "monitorSafeMarginsItem"
        text: "Safe margins"
        checked: root.monitor.safeMargins
        onTriggered: root.monitor.safeMargins = checked
    }
    ToggleItem {
        objectName: "monitorTransparencyGrid"
        text: "Transparency grid"
        checked: root.monitor.transparencyGrid
        onTriggered: root.monitor.transparencyGrid = checked
    }
    Divider {}
    ToggleItem {
        objectName: "monitorShowRulers"
        text: "Rulers"
        checked: root.monitor.rulers
        onTriggered: root.monitor.rulers = checked
    }
    ToggleItem {
        objectName: "monitorShowGuides"
        text: "Guides"
        checked: root.monitor.guidesVisible
        onTriggered: root.monitor.guidesVisible = checked
    }
    ToggleItem {
        objectName: "monitorLockGuides"
        text: "Lock guides"
        enabled: root.monitor.guides.length > 0
        checked: root.monitor.guidesLocked
        onTriggered: root.monitor.guidesLocked = checked
    }
    Ui.MenuItem {
        objectName: "monitorClearGuides"
        text: "Clear guides"
        enabled: root.monitor.guides.length > 0
        onTriggered: root.monitor.clearGuides()
    }
}
