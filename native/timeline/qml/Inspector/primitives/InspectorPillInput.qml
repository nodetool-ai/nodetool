import QtQuick
import NodeTool.Timeline
Rectangle {
    id: root
    property string value: ""
    property string unit: ""
    property string placeholder: ""
    property string ariaLabel: ""
    property bool disabled: false
    property bool allowEmpty: false
    property bool grow: false
    property real minWidth: InspectorTokens.controlXl + Theme.controlXs
    property var scrub: null
    property string size: "small"
    property string draft: value
    property bool typed: false
    property bool stepping: false
    signal gestureStarted()
    signal preview(string value)
    signal commit(string value)
    implicitWidth: minWidth
    implicitHeight: size === "small" ? InspectorTokens.controlSm : Theme.toolbarHeight
    color: Theme.backgroundDefault
    border.width: 1
    border.color: input.activeFocus ? Theme.primary : Theme.overlay
    radius: Theme.radiusSm
    opacity: disabled ? 0.5 : 1
    onValueChanged: if (!input.activeFocus || !typed) draft = value
    function multiplier(modifiers) {
        return modifiers & Qt.ShiftModifier ? 10 : modifiers & Qt.AltModifier ? 0.1 : 1
    }
    function stepped(next, factor) {
        if (scrub.min !== undefined) next = Math.max(scrub.min, next)
        if (scrub.max !== undefined) next = Math.min(scrub.max, next)
        const decimals = (String(scrub.step).split(".")[1] || "").length + (factor < 1 ? 1 : 0)
        return next.toFixed(decimals)
    }
    function commitDraft() {
        if (draft !== value && (allowEmpty || draft.trim() !== "")) commit(draft)
        draft = value
        typed = false
    }
    function finishGesture() {
        commit(draft)
        draft = value
        typed = false
    }
    function endStep() {
        if (!stepping) return
        stepping = false
        finishGesture()
    }
    TextInput {
        id: input
        anchors.left: parent.left
        anchors.right: suffix.left
        anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: Theme.spacingMd
        anchors.rightMargin: root.unit ? Theme.spacingMicro : 0
        text: root.draft
        color: Theme.textPrimary
        selectionColor: Theme.primary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
        horizontalAlignment: TextInput.AlignRight
        selectByMouse: true
        enabled: !root.disabled
        activeFocusOnTab: true
        Accessible.name: root.ariaLabel
        onTextEdited: { root.typed = true; root.draft = text }
        onActiveFocusChanged: {
            if (!activeFocus) {
                root.endStep()
                root.commitDraft()
            }
        }
        onAccepted: root.forceActiveFocus()
        Keys.onEscapePressed: { root.endStep(); root.typed = false; root.draft = root.value; root.stepping = false; root.forceActiveFocus() }
        Keys.onPressed: event => {
            if (!root.scrub || (event.key !== Qt.Key_Up && event.key !== Qt.Key_Down)) return
            const current = parseFloat(root.draft)
            const base = Number.isFinite(current) ? current : parseFloat(root.value)
            if (!Number.isFinite(base)) return
            event.accepted = true
            if (!root.stepping) { root.stepping = true; root.gestureStarted() }
            const factor = root.multiplier(event.modifiers)
            root.draft = root.stepped(base + (event.key === Qt.Key_Up ? 1 : -1) * root.scrub.step * factor, factor)
            root.preview(root.draft)
        }
        Keys.onReleased: event => {
            if ((event.key === Qt.Key_Up || event.key === Qt.Key_Down) && !event.isAutoRepeat) {
                root.endStep()
                event.accepted = true
            }
        }
        Text {
            anchors.fill: parent
            text: root.placeholder
            visible: !input.text && !input.activeFocus
            horizontalAlignment: Text.AlignRight
            color: Theme.textDisabled
            font: input.font
        }
    }
    Text {
        id: suffix
        anchors.right: parent.right
        anchors.rightMargin: Theme.spacingMd
        anchors.verticalCenter: parent.verticalCenter
        text: root.unit
        color: Theme.textSecondary
        font.family: Theme.monoFamily
        font.pixelSize: Theme.fontSizeSmall
    }
    MouseArea {
        id: drag
        anchors.fill: parent
        enabled: !!root.scrub && !input.activeFocus && !root.disabled
        preventStealing: true
        cursorShape: Qt.SizeHorCursor
        property real startX: 0
        property real startValue: 0
        property bool moved: false
        onPressed: mouse => { startX = mouse.x; startValue = parseFloat(root.value); moved = false }
        onPositionChanged: mouse => {
            if (!pressed || !Number.isFinite(startValue)) return
            const dx = mouse.x - startX
            if (!moved) {
                if (Math.abs(dx) < 3) return
                moved = true
                root.gestureStarted()
            }
            const factor = root.multiplier(mouse.modifiers)
            root.draft = root.stepped(startValue + dx * root.scrub.step * factor, factor)
            root.preview(root.draft)
        }
        onReleased: {
            if (moved) { moved = false; root.finishGesture() }
            else { input.forceActiveFocus(); input.selectAll() }
        }
        onCanceled: if (moved) { moved = false; root.finishGesture() }
    }
}
