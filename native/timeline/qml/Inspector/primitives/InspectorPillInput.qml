import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    property string value: ""
    property string unit: ""
    property string placeholder: ""
    property string ariaLabel: ""
    property bool disabled: false
    property bool allowEmpty: false
    property bool grow: false
    property real minWidth: InspectorTokens.rowControlMinWidth
    property var scrub: null
    property string size: "small"
    property string draft: value
    property bool typed: false
    property bool helpSuppressed: false
    signal gestureStarted()
    signal preview(string value)
    signal commit(string value)
    signal canceled()

    implicitWidth: minWidth
    implicitHeight: size === "small" ? Ui.Metrics.compact : Ui.Metrics.comfortable
    onValueChanged: if (!numberField.editing && !textField.editing && !drag.moved) draft = value
    onDisabledChanged: if (disabled && drag.moved) cancelGesture()

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
    function cancelGesture() {
        const fieldEditing = numberField.editing || textField.editing
        drag.aborted = true
        drag.moved = false
        numberField.cancelEdit()
        textField.cancelEdit()
        draft = value
        typed = false
        if (!fieldEditing) canceled()
    }
    Keys.onEscapePressed: event => {
        if (drag.pressed && drag.moved) { cancelGesture(); event.accepted = true }
        else event.accepted = false
    }
    HoverHandler {
        id: valueHover
        onHoveredChanged: if (hovered) root.helpSuppressed = false
    }
    Ui.Tooltip {
        trigger: root
        visible: !!root.scrub && valueHover.hovered && !root.helpSuppressed && !drag.pressed && !numberField.activeFocus && !root.disabled
        text: root.value + (root.unit !== "" ? " " + root.unit : "") + "\nShift: coarse steps. Alt: fine steps."
    }

    Ui.NumberField {
        id: numberField
        previewWhileTyping: false
        objectName: "inspectorNumericField"
        anchors.fill: parent
        visible: !!root.scrub
        enabled: visible && !root.disabled
        accessibleName: root.ariaLabel
        density: root.size === "small" ? Ui.EditorButton.Compact : Ui.EditorButton.Comfortable
        value: Number.isFinite(Number(root.value)) ? Number(root.value) : 0
        displayValue: root.value
        unit: root.unit
        from: root.scrub && root.scrub.min !== undefined ? root.scrub.min : -Infinity
        to: root.scrub && root.scrub.max !== undefined ? root.scrub.max : Infinity
        stepSize: root.scrub ? root.scrub.step : 1
        horizontalAlignment: TextInput.AlignRight
        onEditStarted: root.gestureStarted()
        onValuePreviewed: next => {
            root.draft = root.stepped(next, 1)
            root.preview(root.draft)
        }
        onValueCommitted: next => {
            const nextValue = root.draft.trim() !== "" ? root.draft : root.stepped(next, 1)
            root.commit(nextValue)
            root.draft = root.value
            root.typed = false
        }
        onEditCanceled: { root.draft = root.value; root.typed = false; root.canceled() }
        onTextChanged: if (editing) { root.draft = text; root.typed = true }
    }

    Ui.TextField {
        id: textField
        anchors.fill: parent
        visible: !root.scrub
        enabled: visible && !root.disabled
        accessibleName: root.ariaLabel
        density: root.size === "small" ? Ui.EditorButton.Compact : Ui.EditorButton.Comfortable
        value: root.value
        suffix: root.unit
        placeholderText: root.placeholder
        horizontalAlignment: TextInput.AlignRight
        onValuePreviewed: next => { root.draft = next; root.typed = true }
        onValueCommitted: next => {
            if (root.allowEmpty || next.trim() !== "") root.commit(next)
            else root.canceled()
            root.draft = root.value
            root.typed = false
        }
        onEditCanceled: { root.draft = root.value; root.typed = false; root.canceled() }
    }

    MouseArea {
        id: drag
        anchors.fill: parent
        enabled: !!root.scrub && !numberField.activeFocus && !root.disabled
        preventStealing: true
        cursorShape: Qt.SizeHorCursor
        property real startX: 0
        property real startValue: 0
        property real lastX: 0
        property real currentValue: 0
        property real precisionFactor: 1
        property bool aborted: false
        property bool moved: false
        onPressed: mouse => {
            root.helpSuppressed = true
            startX = lastX = mouse.x
            startValue = currentValue = parseFloat(root.value)
            precisionFactor = 1
            aborted = false
            moved = false
        }
        onPositionChanged: mouse => {
            if (!pressed || aborted || !Number.isFinite(startValue)) return
            const dx = mouse.x - startX
            if (!moved) {
                if (Math.abs(dx) < Ui.Metrics.micro) return
                moved = true
                root.forceActiveFocus()
                root.gestureStarted()
            }
            const factor = root.multiplier(mouse.modifiers)
            currentValue += (mouse.x - lastX) * root.scrub.step * factor
            lastX = mouse.x
            if (root.scrub.min !== undefined) currentValue = Math.max(root.scrub.min, currentValue)
            if (root.scrub.max !== undefined) currentValue = Math.min(root.scrub.max, currentValue)
            precisionFactor = Math.min(precisionFactor, factor)
            root.draft = root.stepped(currentValue, precisionFactor)
            root.preview(root.draft)
        }
        onReleased: {
            if (aborted) return
            if (moved) { moved = false; root.finishGesture() }
            else { numberField.forceActiveFocus(); numberField.selectAll() }
        }
        onCanceled: if (moved) root.cancelGesture()
    }
}
