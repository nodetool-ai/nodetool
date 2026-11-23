import QtQuick
import NodeTool.Timeline
import "automationTargets.js" as Targets
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    property TimelineModel timeline: null
    property var track: ({})
    property string query: ""
    property int highlighted: 0
    onHighlightedChanged: if (highlighted >= 0 && highlighted < options.length) optionList.positionViewAtIndex(highlighted,ListView.Contain)
    readonly property alias popupControl: optionsPopup
    readonly property var options: {
        const used = new Set((track.automation || []).map(lane => Targets.key(lane.target)))
        const shown = AutomationUIState.shownKey(track)
        const needle = query.toLowerCase()
        return Targets.automationTargetSpecs(track).filter(spec => !used.has(spec.key) && spec.key !== shown
            && (spec.group + " " + spec.label).toLowerCase().includes(needle))
    }
    // The parameter column of AutomationHeaderRow.
    readonly property real parameterX: Ui.Metrics.small + Ui.Metrics.xxxl * 2
    objectName: "automation-add-" + track.id
    height: TimelineMetrics.automationAddHeight
    color: Ui.Theme.surfacePanel

    AutomationController { id: controller; timeline: root.timeline; trackId: root.track.id || "" }

    function choose(index) {
        if (index < 0 || index >= options.length) return
        controller.addLane(options[index].target)
        query = ""
        highlighted = 0
        optionsPopup.close()
    }
    function openOptions() {
        if (!optionsPopup.visible && picker.enabled) optionsPopup.openAt(picker)
    }

    Ui.TextField {
        id: picker
        objectName: "automation-picker-" + root.track.id
        anchors.fill: parent
        // Aligned with the parameter column of the rows above.
        anchors.leftMargin: root.parameterX
        anchors.rightMargin: Ui.Metrics.sm
        anchors.topMargin: Ui.Metrics.xs
        anchors.bottomMargin: Ui.Metrics.xs
        value: root.query
        placeholderText: "Automate a parameter"
        accessibleName: "Automate a parameter"
        enabled: !root.track.locked
        TapHandler { onTapped: root.openOptions() }
        onValuePreviewed: value => { root.query = value; root.highlighted = 0; root.openOptions() }
        onAccepted: root.choose(root.highlighted)
        onEditCanceled: { root.query = ""; optionsPopup.close() }
        Keys.onDownPressed: { root.highlighted = Math.min(root.highlighted + 1, root.options.length - 1); root.openOptions() }
        Keys.onUpPressed: root.highlighted = Math.max(0, root.highlighted - 1)
    }

    Ui.Popover {
        id: optionsPopup
        objectName: "automation-options-" + root.track.id
        focus: false
        width: parent ? Math.min(Math.max(picker.width, Ui.Metrics.dialogCompactWidth), parent.width - 2 * Ui.Metrics.dialogNarrowInset) : picker.width
        height: Math.min(implicitHeight, parent ? parent.height - 2 * Ui.Metrics.dialogNarrowInset : implicitHeight)
        implicitHeight: Math.max(Ui.Metrics.standard, Math.min(root.options.length, 8) * Ui.Metrics.comfortable) + 2 * Ui.Metrics.md
        contentItem: ListView {
            id: optionList
            clip: true
            reuseItems: true
            model: root.options
            onCountChanged: if (root.highlighted >= 0 && root.highlighted < count) positionViewAtIndex(root.highlighted,ListView.Contain)
            delegate: Ui.ListRow {
                required property var modelData
                required property int index
                objectName: "automation-option-"+modelData.key
                width: optionList.width
                height: Ui.Metrics.comfortable
                active: index===root.highlighted
                accessibleName: modelData.group+" · "+modelData.label
                Ui.Text {
                    width: parent.width
                    anchors.verticalCenter: parent.verticalCenter
                    verticalAlignment: Text.AlignVCenter
                    text: modelData.group+" · "+modelData.label
                    role: Ui.Typography.SansLabel
                    elide: Text.ElideRight
                }
                onClicked: root.choose(index)
            }
            footer: Ui.Text {
                visible: root.options.length===0
                text: "No matching parameters"
                role: Ui.Typography.SansLabel
                tone: Ui.Text.Secondary
            }
        }
    }
    Ui.Separator { anchors.bottom: parent.bottom; width: parent.width }
}
