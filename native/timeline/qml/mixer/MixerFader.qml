import QtQuick
import NodeTool.Timeline
import "faderTaper.js" as Taper
Item {
    id: root
    property real value: 0
    property string label: "Volume"
    property real draft: value
    property bool dragging: false
    property real grabOffset: 0
    property real lastY: 0
    signal preview(real db)
    signal commit(real db)
    activeFocusOnTab: true
    Accessible.role: Accessible.Slider; Accessible.name: label; Accessible.description: Taper.formatDb(dragging?draft:value)
    function positionAt(y) { return Math.max(0,Math.min(1,1-(y-10)/Math.max(1,height-20))) }
    function finish() { if(dragging) { dragging=false; commit(draft) } }
    onActiveFocusChanged: if(!activeFocus) finish()
    Keys.onPressed: event => {
        var current=dragging?draft:value
        var p=Taper.dbToFaderPosition(current), next=current
        var step=event.modifiers & Qt.ShiftModifier ? .001 : .01
        switch(event.key) {
        case Qt.Key_Right: case Qt.Key_Up: next=Taper.faderPositionToDb(p+step); break
        case Qt.Key_Left: case Qt.Key_Down: next=Taper.faderPositionToDb(p-step); break
        case Qt.Key_PageUp: next=Taper.faderPositionToDb(p+.1); break
        case Qt.Key_PageDown: next=Taper.faderPositionToDb(p-.1); break
        case Qt.Key_Home: next=-120; break
        case Qt.Key_End: next=Math.max(6,value); break
        case Qt.Key_Delete: case Qt.Key_Backspace: next=0; break
        default: return
        }
        dragging=true; draft=next; preview(draft); event.accepted=true
    }
    Keys.onReleased: event => { if(dragging) { finish(); event.accepted=true } }
    Rectangle { x: 12; y: 10; width: 4; height: parent.height-20; radius: Theme.radiusXs; color: Theme.divider }
    Repeater {
        model: Taper.FADER_MARKS
        delegate: Text {
            required property var modelData
            x: 27; y: 10+(root.height-20)*(1-Taper.dbToFaderPosition(modelData[0]))-height/2
            text: modelData[1]; color: Theme.textSecondary; font.family: Theme.monoFamily; font.pixelSize: Theme.fontSizeSmaller
            visible: root.height>160 || modelData[0]===0 || modelData[0]===-120
        }
    }
    Rectangle {
        id: cap
        x: 0; y: (root.height-20)*(1-Taper.dbToFaderPosition(root.dragging?root.draft:root.value))
        width: 28; height: 20; radius: Theme.radiusSm
        color: Theme.textPrimary; border.color: root.activeFocus?Theme.primary:Theme.divider
        Rectangle { x: 2; y: 9; width: parent.width-4; height: 2; color: Theme.backgroundDefault }
    }
    MouseArea {
        anchors.fill: parent; cursorShape: Qt.SizeVerCursor
        onPressed: event => {
            root.forceActiveFocus(); root.draft=root.value; root.lastY=event.y
            var onCap=event.x<=cap.width && event.y>=cap.y && event.y<=cap.y+cap.height
            root.grabOffset=onCap?root.positionAt(event.y)-Taper.dbToFaderPosition(root.value):0
            root.dragging=true
            if(!onCap) { root.draft=Taper.faderPositionToDb(root.positionAt(event.y)); root.preview(root.draft) }
        }
        onPositionChanged: event => {
            if(!root.dragging) return
            var p=Taper.dbToFaderPosition(root.draft), delta=(root.lastY-event.y)/Math.max(1,root.height-20)/10
            if(event.modifiers & Qt.ShiftModifier) {
                root.grabOffset=root.positionAt(event.y)-p-delta
                root.draft=Taper.faderPositionToDb(p+delta)
            } else root.draft=Taper.faderPositionToDb(root.positionAt(event.y)-root.grabOffset)
            root.lastY=event.y; root.preview(root.draft)
        }
        onReleased: root.finish()
        onCanceled: root.finish()
        onDoubleClicked: { root.dragging=false; root.commit(0) }
    }
}
