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
        drag.moved = false
        numberField.cancelEdit()
        textField.cancelEdit()
        draft = value
        typed = false
        if (!fieldEditing) canceled()
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
        property bool moved: false
        onPressed: mouse => { startX = mouse.x; startValue = parseFloat(root.value); moved = false }
        onPositionChanged: mouse => {
            if (!pressed || !Number.isFinite(startValue)) return
            const dx = mouse.x - startX
            if (!moved) {
                if (Math.abs(dx) < Ui.Metrics.micro) return
                moved = true
                root.gestureStarted()
            }
            const factor = root.multiplier(mouse.modifiers)
            root.draft = root.stepped(startValue + dx * root.scrub.step * factor, factor)
            root.preview(root.draft)
        }
        onReleased: {
            if (moved) { moved = false; root.finishGesture() }
            else { numberField.forceActiveFocus(); numberField.selectAll() }
        }
        onCanceled: if (moved) root.cancelGesture()
    }
}
