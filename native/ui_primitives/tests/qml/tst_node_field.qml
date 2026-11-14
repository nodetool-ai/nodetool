import QtQuick
import QtTest
import NodeTool.UiPrimitives as Ui

TestCase {
    name: "NodeField"
    visible: true
    when: windowShown
    width: 400
    height: 200

    Ui.TextField { id: text; x: 10; y: 10; width: 160; variant: Ui.TextField.Node; value: "Name"; accessibleName: "Name" }
    Ui.TextArea { id: area; x: 10; y: 50; width: 160; height: 60; variant: Ui.TextArea.Node; value: "Notes"; accessibleName: "Notes" }
    Ui.NumberField { id: number; x: 200; y: 10; width: 120; variant: Ui.NumberField.Node; value: 3; accessibleName: "Count" }
    Ui.TextField { id: editing; x: 200; y: 50; width: 160; variant: Ui.TextField.NodeEditing; value: "Edit"; accessibleName: "Editing" }

    function frame(item) {
        return {color: item.background.color, width: item.background.border.width, border: item.background.border.color, radius: item.background.radius}
    }

    function checkStates(item, name) {
        item.enabled = true; item.valid = true; item.focus = false
        item.forceActiveFocus(); item.focus = false
        item.enabled = true
        let f = frame(item)
        compare(f.color, Ui.Theme.fieldSurface, name + " idle fill")
        compare(f.border, Qt.color("transparent"), name + " idle border is transparent")
        compare(f.width, Ui.Metrics.border, name + " idle width")
        compare(f.radius, Ui.Metrics.radiusControl, name + " radius")

        item.forceActiveFocus()
        verify(item.activeFocus, name + " takes focus")
        f = frame(item)
        compare(f.color, Ui.Theme.fieldSurfaceFocus, name + " focus fill")
        compare(f.border, Ui.Theme.borderFocus, name + " focus border")
        compare(f.width, Ui.Metrics.focus, name + " focus width")

        item.valid = false
        compare(frame(item).border, Ui.Theme.borderError, name + " invalid border")
        item.valid = true

        item.enabled = false
        f = frame(item)
        compare(f.color, Ui.Theme.fieldSurfaceDisabled, name + " disabled fill")
        compare(f.border, Qt.color("transparent"), name + " disabled border")
        item.enabled = true
    }

    function test_text_field_states() { checkStates(text, "TextField") }
    function test_text_area_states() { checkStates(area, "TextArea") }
    function test_number_field_states() { checkStates(number, "NumberField") }

    function test_number_field_ignores_unparsable_draft_in_node_variant() {
        number.forceActiveFocus()
        number.text = "abc"
        verify(!number.draftValid)
        compare(frame(number).border, Ui.Theme.borderFocus)
        number.cancelEdit()
    }

    function test_node_editing_always_shows_focus_border() {
        editing.focus = false
        const f = frame(editing)
        compare(f.color, Ui.Theme.surfaceInput)
        compare(f.border, Ui.Theme.borderFocus)
        compare(f.width, Ui.Metrics.focus)
        editing.valid = false
        compare(frame(editing).border, Ui.Theme.borderError)
        editing.valid = true
    }

    function test_node_field_metrics_keep_their_values() {
        compare(Ui.Metrics.nodeFieldPadding, 10 * Ui.Theme.uiScale)
        compare(Ui.Metrics.nodeFieldHeight, 34 * Ui.Theme.uiScale)
    }
}
