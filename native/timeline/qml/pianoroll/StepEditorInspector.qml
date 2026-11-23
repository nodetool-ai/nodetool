// The Step Editor's local inspector, laid out as the piano roll's: the clip header, then
// collapsible Lane Set, Lane and Lane Info sections. UI thread only.
// Per-lane settings are session state, never MIDI document fields.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.UiPrimitives as Ui
import "PianoRollTools.js" as Tools

Rectangle {
    id: root
    objectName: "stepEditorInspector"
    required property var panel
    readonly property var lane: panel.selectedLane
    readonly property var setting: panel.laneSettings(lane)
    readonly property var controllerLane: panel.laneData(lane)
    color: Ui.Theme.surfacePanel
    clip: true

    Ui.Separator { orientation: Qt.Vertical; anchors { right: parent.right; top: parent.top; bottom: parent.bottom } }

    // A caption on the left and its value on the right, as in the piano roll inspector.
    component FieldLabel: Row {
        id: labelRow
        property alias text: caption.text
        property alias valueText: valueLabel.text
        width: parent ? parent.width : 0
        Ui.Text {
            id: caption
            width: labelRow.width - valueLabel.width
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
            elide: Text.ElideRight
        }
        Ui.Text {
            id: valueLabel
            role: Ui.Typography.SansLabel
            horizontalAlignment: Text.AlignRight
        }
    }

    Ui.ScrollArea {
        id: scroll
        anchors { fill: parent; rightMargin: Ui.Metrics.border }
        Column {
            id: column
            width: scroll.availableWidth
            padding: Ui.Metrics.md
            spacing: Ui.Metrics.sm
            readonly property real inner: width - 2 * padding

            Row {
                width: column.inner
                spacing: Ui.Metrics.md
                Ui.Icon {
                    anchors.verticalCenter: parent.verticalCenter
                    name: "piano"
                    size: Ui.Metrics.iconLg
                }
                Column {
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width - Ui.Metrics.iconLg - Ui.Metrics.md
                    Ui.Text {
                        width: parent.width
                        role: Ui.Typography.SansLabel
                        elide: Text.ElideRight
                        text: root.panel.midi.clipName || qsTr("MIDI clip")
                    }
                    Ui.Text {
                        width: parent.width
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        elide: Text.ElideRight
                        text: qsTr("Step Editor")
                    }
                }
            }
            Ui.Separator { width: column.inner }

            Ui.InspectorSection {
                objectName: "stepEditorLaneSetSection"
                width: column.inner
                title: qsTr("Lane Set")
                onExpansionRequested: next => expanded = next
                Ui.Select {
                    width: column.inner
                    accessibleName: qsTr("Lane Set")
                    density: Ui.EditorButton.Compact
                    options: [
                        {
                            label: qsTr("Automatic"),
                            value: "automatic"
                        },
                        {
                            label: qsTr("GM Drums"),
                            value: "gmDrums"
                        }
                    ]
                    value: root.panel.laneSet
                    onValueCommitted: value => root.panel.laneSet = value
                }
            }
            Ui.Separator { width: column.inner }

            Ui.InspectorSection {
                objectName: "stepEditorLaneSection"
                width: column.inner
                title: qsTr("Lane: %1").arg(root.panel.laneName(root.lane))
                onExpansionRequested: next => expanded = next
                FieldLabel { text: qsTr("Grid") }
                Ui.Select {
                    width: column.inner
                    accessibleName: qsTr("Grid")
                    density: Ui.EditorButton.Compact
                    enabled: !!root.lane
                    options: Tools.QUANTIZE_OPTIONS.filter(entry => Tools.DIVISION_TICKS[entry.value] !== undefined)
                    value: root.setting.grid
                    onValueCommitted: value => root.panel.setLaneSetting("grid", value)
                }
                FieldLabel { text: qsTr("Pen Width") }
                Ui.NumberField {
                    width: column.inner
                    accessibleName: qsTr("Pen Width")
                    density: Ui.EditorButton.Compact
                    enabled: !!root.lane
                    from: 1
                    to: 16
                    property string targetLaneKey: ""
                    value: root.setting.penWidth
                    onEditStarted: targetLaneKey = root.panel.selectedLaneKey
                    onValueCommitted: value => {
                        root.panel.setLaneSettingFor(targetLaneKey, "penWidth", Math.round(value));
                        text = displayValue;
                    }
                }
                FieldLabel { text: qsTr("Style") }
                Ui.Select {
                    width: column.inner
                    accessibleName: qsTr("Style")
                    density: Ui.EditorButton.Compact
                    enabled: !!root.lane
                    options: [
                        {
                            label: qsTr("No Frames"),
                            value: "filled"
                        },
                        {
                            label: qsTr("Frames"),
                            value: "frames"
                        }
                    ]
                    value: root.setting.frames ? "frames" : "filled"
                    onValueCommitted: value => root.panel.setLaneSetting("frames", value === "frames")
                }
                FieldLabel { visible: !!root.lane && root.lane.type === "note"; text: qsTr("Length (ticks)") }
                Ui.NumberField {
                    width: column.inner
                    visible: !!root.lane && root.lane.type === "note"
                    objectName: "stepEditorLength"
                    accessibleName: qsTr("Length")
                    density: Ui.EditorButton.Compact
                    from: 1
                    to: 9007199254740991
                    property string targetLaneKey: ""
                    value: root.setting.length
                    onEditStarted: targetLaneKey = root.panel.selectedLaneKey
                    onValueCommitted: value => {
                        root.panel.setLaneSettingFor(targetLaneKey, "length", Math.round(value));
                        text = displayValue;
                    }
                }
            }
            Ui.Separator { width: column.inner }

            Ui.InspectorSection {
                objectName: "stepEditorLaneInfoSection"
                width: column.inner
                title: qsTr("Lane Info")
                onExpansionRequested: next => expanded = next
                FieldLabel { text: qsTr("Status"); valueText: (!root.lane ? "" : root.lane.type === "note" ? qsTr("Note") : !root.controllerLane ? "" : root.controllerLane.kind === "cc" ? qsTr("Control") : root.controllerLane.kind === "pitchBend" ? qsTr("Pitch Bend") : root.controllerLane.kind === "channelPressure" ? qsTr("Channel Pressure") : qsTr("Poly Pressure")) }
                FieldLabel { text: qsTr("MIDI Channel"); valueText: (!root.lane ? "" : root.controllerLane ? (root.controllerLane.channel || 0) + 1 : 1) }
                FieldLabel { text: qsTr("Number"); valueText: (!root.lane ? "" : root.lane.type === "note" ? root.lane.pitch : !root.controllerLane ? "" : root.controllerLane.kind === "cc" ? root.controllerLane.cc : root.controllerLane.kind === "polyPressure" ? root.controllerLane.pitch : "") }
            }
        }
    }
}
