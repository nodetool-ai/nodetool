import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
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
    Ui.Icon {
        visible: !root.master; name: TimelineVisuals.trackIconName(root.channel.type)
        size: Ui.Metrics.iconXs; y: 1; domainColor: TimelineVisuals.trackAccent(root.channel.type)
    }
    Ui.Text { role: Ui.Typography.SansLabel;
        id: head; x: root.master ? 0 : Ui.Metrics.iconXs+Ui.Metrics.xs
        width: parent.width-x; height: Math.max(Ui.Metrics.iconSm, implicitHeight)
        text: root.channelName; elide: Text.ElideRight; }
    Ui.Surface {
        id: device; variant: Ui.Surface.Input; anchors.top: head.bottom; anchors.topMargin: Ui.Metrics.xs
        width: parent.width; height: Math.max(Ui.Metrics.small, deviceLabel.implicitHeight + Ui.Metrics.xs)
        Ui.Text { id: deviceLabel; role: Ui.Typography.SansCaption; anchors.fill: parent; anchors.leftMargin: Ui.Metrics.xs; verticalAlignment: Text.AlignVCenter; text: root.master ? "Stereo out" : root.channel.type === "midi"
            ? ({subtractive:"Synth",wavetable:"WT-1 Wavetable",bass:"BL-1 Bass",drum:"DR-1 Drums",sampler:"Sampler",vst:"VST"})[(root.channel.instrument || {}).type || "subtractive"] || "Instrument" : "Audio"; tone: Ui.Text.Secondary }
    }
    InsertSlots {
        id: inserts; anchors.top: device.bottom; anchors.topMargin: Ui.Metrics.xs
        width: parent.width; channelId: root.channelId; channel: root.channelName; effects: root.channel.effects || []
        maxListHeight: Math.max(20,Math.min(96,root.height-180))
        onAdd: effect => root.addEffect(effect)
        onToggle: (id,enabled) => root.toggleEffect(id,enabled)
        onOpen: (id,anchor) => root.openEffect(id,anchor)
    }
    Item {
        id: body; anchors.top: inserts.bottom; anchors.topMargin: Ui.Metrics.xs; anchors.bottom: readout.top; anchors.bottomMargin: Ui.Metrics.xs
        width: parent.width
        Item {
            id: side
            width: root.compact ? parent.width : 36
            height: root.compact ? 64 : parent.height
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
                function cancel() { dragging=false; root.panGesture=false; root.draftPan=root.channel.pan || 0 }
                function nudge(next) { root.panGesture=true; root.draftPan=Math.max(-1,Math.min(1,next)) }
                onActiveFocusChanged: if(!activeFocus) finish()
                Keys.onPressed: event => {
                    if (event.key === Qt.Key_Escape && root.panGesture) { cancel(); event.accepted=true; return }
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
                        ctx.fillStyle=Ui.Theme.actionHover; ctx.fill()
                        ctx.lineWidth=3; ctx.lineCap="round"; ctx.strokeStyle=Ui.Theme.borderSubtle
                        ctx.beginPath(); ctx.arc(c,c,r,-225*Math.PI/180,45*Math.PI/180); ctx.stroke()
                        ctx.strokeStyle=Ui.Theme.accentPrimary; ctx.beginPath()
                        ctx.arc(c,c,r,-Math.PI/2,(angle-90)*Math.PI/180,angle<0); ctx.stroke()
                        ctx.beginPath(); ctx.moveTo(c,c)
                        ctx.lineTo(c+Math.cos((angle-90)*Math.PI/180)*(r-4),c+Math.sin((angle-90)*Math.PI/180)*(r-4))
                        ctx.strokeStyle=Ui.Theme.textPrimary; ctx.lineWidth=2; ctx.stroke()
                        if(pan.activeFocus) { ctx.strokeStyle=Ui.Theme.accentPrimary; ctx.lineWidth=1; ctx.strokeRect(0,0,width,height) }
                    }
                    Connections { target: root; function onDisplayPanChanged() { panDial.requestPaint() } }
                    Connections { target: pan; function onActiveFocusChanged() { panDial.requestPaint() } }
                    Connections { target: Ui.Theme; function onEffectiveSchemeChanged() { panDial.requestPaint() } }
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
                    onCanceled: pan.cancel()
                    onDoubleClicked: { pan.dragging=false; root.panGesture=false; root.panCommit(0) }
                }
            }
            Ui.Text { role: Ui.Typography.MonoCaption; x: root.compact ? 30 : 0; y: root.compact ? 8 : 30; width: 36; text: Taper.formatPan(root.displayPan); tone: Ui.Text.Secondary; horizontalAlignment: Text.AlignHCenter }
            Item {
                x: 0; y: root.compact ? 32 : 60; height: root.compact ? Ui.Metrics.compact : Ui.Metrics.compact * 2 + Ui.Metrics.xs
                width: parent.width
                // The roomy strip stacks the two toggles beside the fader.
                Ui.EditorButton {
                    objectName: "mute-" + root.channelId
                    width: root.compact ? (side.width - Ui.Metrics.xs) / 2 : side.width
                    density: Ui.EditorButton.Compact
                    text: "M"
                    checkable: true
                    checked: !!root.channel.muted
                    accessibleName: (root.channel.muted ? "Unmute " : "Mute ") + root.channelName
                    onClicked: root.mute()
                }
                Ui.EditorButton {
                    objectName: "solo-" + root.channelId
                    x: root.compact ? (side.width + Ui.Metrics.xs) / 2 : 0
                    y: root.compact ? 0 : Ui.Metrics.compact + Ui.Metrics.xs
                    width: root.compact ? (side.width - Ui.Metrics.xs) / 2 : side.width
                    density: Ui.EditorButton.Compact
                    text: "S"
                    checkable: true
                    checked: !!root.channel.solo
                    accessibleName: (root.channel.solo ? "Unsolo " : "Solo ") + root.channelName
                    onClicked: root.solo()
                }
            }
        }
        Item {
            id: level
            y: root.compact ? 68 : 0; height: parent.height-y
            width: root.compact || root.master ? parent.width : parent.width-40
            MixerFader {
                id: fader; objectName: "fader-" + root.channelId
                height: parent.height; width: Math.max(24,Math.min(54,parent.width-18))
                x: Math.max(0,(parent.width-72)/2)
                value: root.displayDb
                label: root.channelName+" volume"
                onPreview: db => { root.volumeGesture=true; root.draftDb=db }
                onCommit: db => { root.volumeGesture=false; root.volumeCommit(db) }
                onCanceled: { root.volumeGesture=false; root.draftDb=root.channel.volumeDb || 0 }
            }
            MixerMeter {
                x: fader.x+fader.width+Ui.Metrics.xs; width: 12; height: parent.height
                channelId: root.channelId
            }
        }
    }
    Ui.TextField {
        id: readout
        objectName: "db-readout-" + root.channelId
        anchors.bottom: parent.bottom
        width: parent.width
        density: Ui.EditorButton.Compact
        value: activeFocus ? (root.channel.volumeDb || 0).toFixed(1) : Taper.formatDb(root.displayDb)
        horizontalAlignment: TextInput.AlignHCenter
        valid: Taper.parseDb(text) !== null
        errorText: qsTr("Enter a level in dB")
        accessibleName: root.channelName + " level (dB)"
        onValueCommitted: text => {
            const next = Taper.parseDb(text)
            if (next !== null) root.volumeCommit(next)
        }
    }
}
