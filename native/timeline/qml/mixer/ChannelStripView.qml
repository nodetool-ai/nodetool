import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import "faderTaper.js" as Taper
Item {
    id: root
    property var channel: ({})
    property string channelId: ""
    property string channelName: ""
    property bool master: false
    property bool compact: false
    property real draftDb: channel.volumeDb || 0
    property real draftPan: channel.pan || 0
    property bool volumeGesture: false
    property bool panGesture: false
    signal volumeCommit(real db)
    signal panCommit(real pan)
    signal mute()
    signal solo()
    signal addEffect(var effect)
    signal toggleEffect(string effectId, bool enabled)
    signal openEffect(string effectId, var anchor)
    readonly property real displayDb: volumeGesture ? draftDb : (channel.volumeDb || 0)
    readonly property real displayPan: panGesture ? draftPan : (channel.pan || 0)
    function cancelGesture() { volumeGesture=false; panGesture=false; fader.dragging=false; pan.dragging=false }
    function endVolume() { if(volumeGesture) { volumeGesture=false; volumeCommit(draftDb) } }
    function endPan() { if(panGesture) { panGesture=false; panCommit(draftPan) } }
    Icon {
        visible: !root.master; path: Theme.trackIcon(root.channel.type)
        size: Theme.iconXs; y: 1; color: Theme.trackAccent(root.channel.type)
    }
    Text {
        id: head; x: root.master ? 0 : Theme.iconXs+Theme.spacingXs
        width: parent.width-x; height: 16
        text: root.channelName; elide: Text.ElideRight; color: Theme.textPrimary
        font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall; font.weight: Font.Medium
    }
    Rectangle {
        id: device; anchors.top: head.bottom; anchors.topMargin: Theme.spacingXs
        width: parent.width; height: 20; color: "transparent"; border.color: Theme.divider; radius: Theme.radiusSm
        Text { anchors.fill: parent; anchors.leftMargin: Theme.spacingXs; verticalAlignment: Text.AlignVCenter; text: root.master ? "Stereo out" : root.channel.type === "midi"
            ? ({subtractive:"Synth",wavetable:"WT-1 Wavetable",bass:"BL-1 Bass",drum:"DR-1 Drums",sampler:"Sampler",vst:"VST"})[(root.channel.instrument || {}).type || "subtractive"] || "Instrument" : "Audio"; color: Theme.textSecondary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmaller }
    }
    InsertSlots {
        id: inserts; anchors.top: device.bottom; anchors.topMargin: Theme.spacingXs
        width: parent.width; channelId: root.channelId; channel: root.channelName; effects: root.channel.effects || []
        maxListHeight: Math.max(20,Math.min(96,root.height-180))
        onAdd: effect => root.addEffect(effect)
        onToggle: (id,enabled) => root.toggleEffect(id,enabled)
        onOpen: (id,anchor) => root.openEffect(id,anchor)
    }
    Item {
        id: body; anchors.top: inserts.bottom; anchors.topMargin: Theme.spacingXs; anchors.bottom: readout.top; anchors.bottomMargin: Theme.spacingXs
        width: parent.width
        Item {
            id: side
            width: root.compact ? parent.width : 36
            height: root.compact ? 52 : parent.height
            x: root.compact ? 0 : parent.width-width
            visible: !root.master
            Item {
                id: pan; objectName: "pan-" + root.channelId
                width: 28; height: 28; x: root.compact ? 0 : 4
                property bool dragging: false
                property real startX: 0
                property real startY: 0
                property real startValue: 0
                activeFocusOnTab: true
                Accessible.role: Accessible.Slider
                Accessible.name: root.channelName + " pan"
                Accessible.description: Taper.panValueText(root.displayPan)
                function finish() { dragging=false; root.endPan() }
                function nudge(next) { root.panGesture=true; root.draftPan=Math.max(-1,Math.min(1,next)) }
                onActiveFocusChanged: if(!activeFocus) finish()
                Keys.onPressed: event => {
                    var current=root.displayPan, next=current
                    var step=event.modifiers & Qt.ShiftModifier ? .001 : .01
                    switch(event.key) {
                    case Qt.Key_Right: case Qt.Key_Up: next=current+step; break
                    case Qt.Key_Left: case Qt.Key_Down: next=current-step; break
                    case Qt.Key_PageUp: next=current+.1; break
                    case Qt.Key_PageDown: next=current-.1; break
                    case Qt.Key_Home: next=-1; break
                    case Qt.Key_End: next=1; break
                    case Qt.Key_Delete: case Qt.Key_Backspace: next=0; break
                    default: return
                    }
                    nudge(next); event.accepted=true
                }
                Keys.onReleased: event => { if(root.panGesture) { finish(); event.accepted=true } }
                Canvas {
                    id: panDial; anchors.fill: parent
                    onPaint: {
                        var ctx=getContext("2d"), c=width/2, r=c-3
                        var angle=root.displayPan*135
                        ctx.reset(); ctx.beginPath(); ctx.arc(c,c,r-2,0,2*Math.PI)
                        ctx.fillStyle=Theme.actionHover; ctx.fill()
                        ctx.lineWidth=3; ctx.lineCap="round"; ctx.strokeStyle=Theme.divider
                        ctx.beginPath(); ctx.arc(c,c,r,-225*Math.PI/180,45*Math.PI/180); ctx.stroke()
                        ctx.strokeStyle=Theme.primary; ctx.beginPath()
                        ctx.arc(c,c,r,-Math.PI/2,(angle-90)*Math.PI/180,angle<0); ctx.stroke()
                        ctx.beginPath(); ctx.moveTo(c,c)
                        ctx.lineTo(c+Math.cos((angle-90)*Math.PI/180)*(r-4),c+Math.sin((angle-90)*Math.PI/180)*(r-4))
                        ctx.strokeStyle=Theme.textPrimary; ctx.lineWidth=2; ctx.stroke()
                        if(pan.activeFocus) { ctx.strokeStyle=Theme.primary; ctx.lineWidth=1; ctx.strokeRect(0,0,width,height) }
                    }
                    Connections { target: root; function onDisplayPanChanged() { panDial.requestPaint() } }
                    Connections { target: pan; function onActiveFocusChanged() { panDial.requestPaint() } }
                }
                MouseArea {
                    anchors.fill: parent; cursorShape: Qt.SizeAllCursor
                    onPressed: event => {
                        pan.forceActiveFocus(); pan.startValue=root.displayPan
                        pan.startX=event.x; pan.startY=event.y; pan.dragging=true
                        root.draftPan=root.displayPan; root.panGesture=true
                    }
                    onPositionChanged: event => {
                        if(!pan.dragging) return
                        var delta=pan.startY-event.y+event.x-pan.startX
                        pan.nudge(pan.startValue+delta*2/(160*(event.modifiers & Qt.ShiftModifier ? 10 : 1)))
                    }
                    onReleased: pan.finish()
                    onCanceled: pan.finish()
                    onDoubleClicked: { pan.dragging=false; root.panGesture=false; root.panCommit(0) }
                }
            }
            Text { x: root.compact ? 30 : 0; y: root.compact ? 8 : 30; width: 36; text: Taper.formatPan(root.displayPan); color: Theme.textSecondary; font.family: Theme.monoFamily; font.pixelSize: Theme.fontSizeSmaller; horizontalAlignment: Text.AlignHCenter }
            Item {
                x: 0; y: root.compact ? 32 : 60; height: root.compact ? 20 : 44
                width: parent.width
                // The roomy strip stacks the two toggles beside the fader.
                Controls.Button {
                    objectName: "mute-" + root.channelId; width: root.compact ? (side.width-4)/2 : 36; height: 20
                    palette.buttonText: root.channel.muted ? Theme.backgroundDefault : Theme.textSecondary
                    font.family: Theme.monoFamily; font.pixelSize: Theme.fontSizeSmall; font.weight: Font.DemiBold
                    text: "M"; checkable: true; checked: !!root.channel.muted
                    Accessible.name: (root.channel.muted?"Unmute ":"Mute ")+root.channelName
                    onClicked: root.mute()
                    background: Rectangle { color: root.channel.muted ? Theme.warning : "transparent"; border.color: Theme.divider; radius: Theme.radiusSm }
                }
                Controls.Button {
                    objectName: "solo-" + root.channelId
                    x: root.compact ? (side.width+4)/2 : 0; y: root.compact ? 0 : 24
                    width: root.compact ? (side.width-4)/2 : 36; height: 20
                    palette.buttonText: root.channel.solo ? Theme.backgroundDefault : Theme.textSecondary
                    font.family: Theme.monoFamily; font.pixelSize: Theme.fontSizeSmall; font.weight: Font.DemiBold
                    text: "S"; checkable: true; checked: !!root.channel.solo
                    Accessible.name: (root.channel.solo?"Unsolo ":"Solo ")+root.channelName
                    onClicked: root.solo()
                    background: Rectangle { color: root.channel.solo ? Theme.success : "transparent"; border.color: Theme.divider; radius: Theme.radiusSm }
                }
            }
        }
        Item {
            id: level
            y: root.compact ? 56 : 0; height: parent.height-y
            width: root.compact || root.master ? parent.width : parent.width-40
            MixerFader {
                id: fader; objectName: "fader-" + root.channelId
                height: parent.height; width: Math.max(24,Math.min(54,parent.width-18))
                x: Math.max(0,(parent.width-72)/2)
                value: root.displayDb
                label: root.channelName+" volume"
                onPreview: db => { root.volumeGesture=true; root.draftDb=db }
                onCommit: db => { root.volumeGesture=false; root.volumeCommit(db) }
            }
            MixerMeter {
                x: fader.x+fader.width+Theme.spacingXs; width: 12; height: parent.height
                channelId: root.channelId
            }
        }
    }
    Controls.TextField {
        id: readout; objectName: "db-readout-"+root.channelId
        anchors.bottom: parent.bottom; width: parent.width; height: 20; padding: 0
        property bool cancelled: false
        onActiveFocusChanged: if(activeFocus) cancelled=false
        text: activeFocus ? (root.channel.volumeDb || 0).toFixed(1) : Taper.formatDb(root.displayDb)
        horizontalAlignment: TextInput.AlignHCenter
        color: Theme.textPrimary; font.family: Theme.monoFamily; font.pixelSize: Theme.fontSizeSmaller
        Accessible.name: root.channelName+" level (dB)"
        background: Rectangle { color: Theme.backgroundDefault; border.color: readout.activeFocus?Theme.primary:Theme.divider; radius: Theme.radiusSm }
        onEditingFinished: { var next=Taper.parseDb(text); if(next!==null && !cancelled) root.volumeCommit(next); focus=false }
        Keys.onEscapePressed: { cancelled=true; text=Taper.formatDb(root.channel.volumeDb || 0); focus=false }
    }
}
