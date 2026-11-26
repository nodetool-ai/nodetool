pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.UiPrimitives as Ui
import "faderTaper.js" as Taper

FocusScope {
    id: root
    property real value: 0
    property real minimumDb: -120
    property real maximumDb: 24
    property string label: "Volume"
    property real draft: value
    property real editBaseline: value
    property alias dragging: fader.editing
    signal started()
    signal preview(real db)
    signal commit(real db)
    signal canceled()

    Ui.Fader {
        id: fader
        objectName: "mixerFaderInput"
        focus: true
        cancelOnFocusLoss: true
        anchors.fill: parent
        value: Taper.dbToFaderPosition(root.value)
        marks: Taper.FADER_MARKS.filter(mark => root.height > 160 || mark[0] === 0 || mark[0] === -120)
            .map(mark => ({position: Taper.dbToFaderPosition(mark[0]), label: mark[1]}))
        accessibleName: root.label
        accessibleValueText: Taper.formatDb(editing ? root.draft : root.value)
        resetValue: Taper.dbToFaderPosition(0)
        customEndKey: true
        onEditStarted: { root.started(); root.editBaseline = root.value; root.draft = root.value }
        onValuePreviewed: position => {
            root.draft = Math.max(root.minimumDb,Math.min(root.maximumDb,Taper.faderPositionToDb(position)))
            root.preview(root.draft)
        }
        onValueCommitted: root.commit(root.draft)
        onEditCanceled: { root.draft = root.editBaseline; root.canceled() }
        onEndKeyRequested: {
            begin()
            draft = 1
            root.draft = Math.min(root.maximumDb,Math.max(6, root.value))
            root.preview(root.draft)
        }
    }
}
