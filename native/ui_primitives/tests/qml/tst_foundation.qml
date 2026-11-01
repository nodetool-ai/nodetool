import QtQuick
import QtTest
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

TestCase {
    name: "Foundation"
    visible: true
    when: windowShown
    width: 400; height: 200
    Ui.Text { id: label; text: "Sample" }
    property bool desiredButtonEnabled: true
    Ui.EditorButton { id: button; text: "Run"; accessibleName: "Run" }
    Ui.EditorButton { id: centeredButton; visible: false; x: 200; y: 120; z: 1000; variant: Ui.EditorButton.Primary; text: "HHH"; accessibleName: "Centered" }
    Ui.Select { id: centeredSelect; visible: false; x: 200; y: 120; z: 1000; width: 120; value: "h"; options: [{label: "HHH", value: "h"}]; accessibleName: "Centered select" }
    Basic.Action { id: testAction; text: "Action"; checkable: true }
    Ui.EditorButton { id: actionButton; x: 100; action: testAction; accessibleName: "Action" }
    SignalSpy { id: actionTriggered; target: testAction; signalName: "triggered" }
    SignalSpy { id: actionClicked; target: actionButton; signalName: "clicked" }
    Ui.Popover { id: buttonMenu; width: 80; height: 40 }
    Ui.MenuButton { id: menuButton; x: 250; y: 110; text: "Menu"; menu: buttonMenu }
    Ui.Dialog { id: dialog; title: "Appearance"; width: 160; height: 100; returnFocusTo: button }
    Ui.InspectorSection { id: section; x: 0; y: 20; width: 120; title: "Position"; Ui.Text { objectName: "sectionBody"; text: "Value" } }
    SignalSpy { id: expansion; target: section; signalName: "expansionRequested" }
    Ui.InspectorRow { id: inspectorRow; x: 200; y: 0; label: "Opacity"; Ui.Text { objectName: "rowValue"; text: "100%" } }
    Ui.InspectorCard { id: inspectorCard; x: 200; y: 40; Ui.Text { objectName: "cardContent"; text: "Clip" } }
    Ui.Banner { id: banner; x: 230; y: 150; status: Ui.Status.Warning; message: "Offline"; actionText: "Retry" }
    SignalSpy { id: bannerAction; target: banner; signalName: "actionTriggered" }
    Ui.EmptyState { id: empty; visible: false; title: "No results"; message: "Try another search"; actionText: "Clear" }
    Ui.BusyIndicator { id: busy; x: 180; y: 0 }
    Ui.ScrollBar { id: scroll; x: 190; y: 0; width: 8; height: 100; orientation: Qt.Vertical; size: 0.25; position: 0.25 }
    Ui.ProviderIcon { id: providerIcon; entry: "openai" }
    property real sourceValue: 0.5
    Ui.Slider { id: slider; x: 0; y: 150; width: 100; value: sourceValue; from: 0; to: 1; stepSize: 0.1; accessibleName: "Amount" }
    SignalSpy { id: sliderStart; target: slider; signalName: "editStarted" }
    SignalSpy { id: sliderPreview; target: slider; signalName: "valuePreviewed" }
    SignalSpy { id: sliderCancel; target: slider; signalName: "editCanceled" }
    SignalSpy { id: sliderCommit; target: slider; signalName: "valueCommitted" }
    Ui.ToolbarIconButton { id: iconButton; x: 160; y: 150; text: "A very long accessible name"; iconName: "add" }
    Ui.Icon { id: keyframeIcon; name: "keyframeDiamond" }
    Ui.CheckBox { id: check; x: 130; y: 150; accessibleName: "Enable section" }
    SignalSpy { id: checkChanges; target: check; signalName: "checkedChangedByUser" }
    Ui.Toggle { id: toggle; x: 100; y: 150; accessibleName: "Enable" }
    SignalSpy { id: toggled; target: toggle; signalName: "checkedChangedByUser" }
    Ui.Select { id: select; x: 100; y: 90; width: 100; value: "a"; accessibleName: "Choice"; options: [{label: "Alpha", value: "a"}, {label: "Beta", value: "b"}] }
    SignalSpy { id: selected; target: select; signalName: "valueCommitted" }
    Ui.NumberField { id: number; x: 0; y: 90; width: 100; value: 5; from: 0; to: 10; stepSize: 1; accessibleName: "Amount" }
    SignalSpy { id: numberPreview; target: number; signalName: "valuePreviewed" }
    SignalSpy { id: numberCommit; target: number; signalName: "valueCommitted" }
    SignalSpy { id: numberCancel; target: number; signalName: "editCanceled" }
    Ui.TextArea { id: area; x: 300; y: 80; width: 100; height: 80; value: "initial"; accessibleName: "Details" }
    SignalSpy { id: areaStart; target: area; signalName: "editStarted" }
    SignalSpy { id: areaCommit; target: area; signalName: "valueCommitted" }
    SignalSpy { id: areaCancel; target: area; signalName: "editCanceled" }
    Connections { target: field; function onValuePreviewed(v) { if (field.objectName === "live") field.value = v } }
    Ui.TextField { id: field; x: 300; width: 100; value: "initial"; accessibleName: "Name" }
    SignalSpy { id: accepted; target: field; signalName: "accepted" }
    SignalSpy { id: fieldStarted; target: field; signalName: "editStarted" }
    SignalSpy { id: fieldPreview; target: field; signalName: "valuePreviewed" }
    SignalSpy { id: fieldCommit; target: field; signalName: "valueCommitted" }
    SignalSpy { id: fieldCancel; target: field; signalName: "editCanceled" }
    Ui.Fader { id: fader; x: 200; width: 80; height: 180; value: 0.5; accessibleName: "Volume" }
    SignalSpy { id: started; target: fader; signalName: "editStarted" }
    SignalSpy { id: previews; target: fader; signalName: "valuePreviewed" }
    SignalSpy { id: commits; target: fader; signalName: "valueCommitted" }
    SignalSpy { id: cancels; target: fader; signalName: "editCanceled" }
    SignalSpy { id: clicked; target: button; signalName: "clicked" }
    SignalSpy { id: buttonFocusChanges; target: button; signalName: "activeFocusChanged" }
    function init() { Ui.Theme.preference = Ui.Theme.System; Ui.Theme.systemScheme = Ui.Theme.Unknown; Ui.Theme.uiScale = 1; Ui.Theme.textScale = 1; clicked.clear() }
    function test_invalid_enums() {
        Ui.Theme.preference = 99; compare(Ui.Theme.preference, Ui.Theme.System)
        Ui.Theme.systemScheme = 99; compare(Ui.Theme.systemScheme, Ui.Theme.Unknown)
        label.role = 99; compare(label.role, Ui.Typography.SansBody)
        label.tone = 99; compare(label.tone, Ui.Text.Primary)
        button.density = 99; compare(button.density, Ui.EditorButton.Standard)
        button.variant = 99; compare(button.variant, Ui.EditorButton.Default)
    }
    function luminance(color) {
        function channel(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
        return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
    }
    function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
    function test_contrast() {
        for (const scheme of [Ui.Theme.Dark, Ui.Theme.Light]) {
            Ui.Theme.preference = scheme
            for (const surface of [Ui.Theme.surfaceCanvas, Ui.Theme.surfacePanel, Ui.Theme.surfaceInput, Ui.Theme.surfaceOverlay]) {
                verify(contrast(Ui.Theme.textPrimary, surface) >= 4.5)
                verify(contrast(Ui.Theme.textSecondary, surface) >= 4.5)
            }
            verify(contrast(Ui.Theme.textOnAccent, Ui.Theme.accentPrimary) >= 4.5)
            verify(contrast(Ui.Theme.textOnAccent, Ui.Theme.accentHover) >= 4.5)
            verify(contrast(Ui.Theme.textOnAccent, Ui.Theme.destructivePrimary) >= 4.5)
            verify(contrast(Ui.Theme.textOnAccent, Ui.Theme.destructiveHover) >= 4.5)
            verify(contrast(Ui.Theme.statusWarningOnSurface, Ui.Theme.statusWarningSurface) >= 4.5)
            verify(contrast(Ui.Theme.statusErrorOnSurface, Ui.Theme.statusErrorSurface) >= 4.5)
            verify(contrast(Ui.Theme.borderFocus, Ui.Theme.surfacePanel) >= 3)
        }
    }
    function test_theme() {
        compare(Ui.Theme.effectiveScheme, Ui.Theme.Dark)
        Ui.Theme.systemScheme = Ui.Theme.Light
        compare(Ui.Theme.effectiveScheme, Ui.Theme.Light)
        Ui.Theme.preference = Ui.Theme.Dark
        compare(Ui.Theme.effectiveScheme, Ui.Theme.Dark)
    }
    function test_scale() {
        compare(Ui.Metrics.compact, 28)
        compare(Ui.Metrics.standard, 32)
        compare(label.font.pixelSize, 15)
        Ui.Theme.uiScale = 1.5
        Ui.Theme.textScale = 2
        compare(Ui.Metrics.compact, 42)
        compare(label.font.pixelSize, 45)
    }
    function test_invalid_scale() {
        for (const invalid of [0, -1, NaN, Infinity]) {
            Ui.Theme.uiScale = invalid
            compare(Ui.Theme.uiScale, 1)
            Ui.Theme.textScale = invalid
            compare(Ui.Theme.textScale, 1)
        }
        Ui.Theme.uiScale = 0.75
        Ui.Theme.textScale = 1.25
        compare(Ui.Metrics.compact, 21)
        compare(Ui.Typography.pixelSize(Ui.Typography.SansBody), 14.0625)
    }
    function test_inspector_slots() {
        verify(findChild(section, "sectionBody") !== null)
        verify(findChild(inspectorRow, "rowValue") !== null)
        verify(findChild(inspectorCard, "cardContent") !== null)
        expansion.clear(); mouseClick(findChild(section, "sectionToggle"))
        compare(expansion.count, 1); compare(expansion.signalArguments[0][0], false)
        verify(section.expanded)
    }
    function test_busy_motion() {
        Ui.Theme.reducedMotion = true; compare(busy.animating, false)
        Ui.Theme.reducedMotion = false; busy.visible = false; compare(busy.animating, false)
        busy.visible = true; busy.running = false; compare(busy.animating, false)
        busy.running = true
        tryVerify(() => busy.animating)
    }
    function test_menu_button() {
        mouseClick(menuButton)
        tryVerify(() => buttonMenu.visible)
        verify(menuButton.menuExpanded)
        keyClick(Qt.Key_Escape)
        tryVerify(() => !buttonMenu.visible)
        tryVerify(() => menuButton.activeFocus)
        verify(!menuButton.menuExpanded)
        verify(!menuButton.checkable)
    }
    function test_feedback() {
        compare(banner.status, Ui.Status.Warning)
        verify(banner.implicitWidth > 0 && banner.implicitHeight > 0)
        compare(empty.title, "No results")
        compare(empty.actionText, "Clear")
        const action = findChild(banner, "bannerActionButton")
        verify(action !== null)
        bannerAction.clear()
        mouseClick(action)
        compare(bannerAction.count, 1)
    }
    function test_scrollbar_policy() {
        scroll.size = 1; verify(scroll.visible); compare(scroll.opacity, 0); verify(!scroll.interactive)
        scroll.size = 0.25; verify(scroll.visible); compare(scroll.opacity, 1); verify(scroll.interactive)
    }
    function test_scrollbar() {
        verify(scroll.contentItem.height > 0)
        const before = scroll.position
        mousePress(scroll, scroll.width / 2, scroll.height * 0.35)
        mouseMove(scroll, scroll.width / 2, scroll.height * 0.65)
        mouseRelease(scroll, scroll.width / 2, scroll.height * 0.65)
        verify(scroll.position > before)
    }
    function test_provider_theme() {
        const logo = findChild(providerIcon, "providerLogo")
        Ui.Theme.preference = Ui.Theme.Dark
        tryCompare(logo, "status", Image.Ready)
        verify(String(logo.source).indexOf("providers/openai.svg") >= 0)
        Ui.Theme.preference = Ui.Theme.Light
        tryCompare(logo, "status", Image.Ready)
        verify(String(logo.source).indexOf("providers-light/openai.svg") >= 0)
    }
    function test_fonts() {
        tryCompare(Ui.Typography.interRegular, "status", FontLoader.Ready)
        tryCompare(Ui.Typography.interMedium, "status", FontLoader.Ready)
        tryCompare(Ui.Typography.interSemibold, "status", FontLoader.Ready)
        compare(Ui.Typography.sansFamily, "Inter")
        tryCompare(Ui.Typography.monoRegular, "status", FontLoader.Ready)
        tryCompare(Ui.Typography.monoMedium, "status", FontLoader.Ready)
        tryCompare(Ui.Typography.monoSemibold, "status", FontLoader.Ready)
        compare(Ui.Typography.monoFamily, "JetBrains Mono")
        compare(Ui.Typography.canvasFont(Ui.Typography.MonoCaption), '400 11px "JetBrains Mono"')
        compare(Ui.Typography.canvasFont(Ui.Typography.MonoLabel), '500 13px "JetBrains Mono"')
        compare(Ui.Typography.canvasFont(Ui.Typography.SansTitle), '600 18px "Inter"')
        compare(Ui.Typography.canvasFont(99), '400 15px "Inter"')
        Ui.Theme.uiScale = 1.5
        Ui.Theme.textScale = 2
        compare(Ui.Typography.canvasFont(Ui.Typography.MonoCaption), '400 33px "JetBrains Mono"')
    }
    function test_slider_external_during_drag() {
        sourceValue = 0.5; sliderCancel.clear(); sliderCommit.clear()
        mousePress(slider, 50, slider.height / 2)
        mouseMove(slider, 80, slider.height / 2)
        verify(slider.editing)
        const draft = slider.draft
        sourceValue = 0.2
        compare(slider.draft, draft)
        keyClick(Qt.Key_Escape)
        compare(sliderCancel.count, 1); compare(sliderCommit.count, 0)
        compare(findChild(slider, "nativeSliderControl").value, 0.2)
        mouseRelease(slider, 80, slider.height / 2)
    }
    function test_slider_external_binding() {
        sourceValue = 0.5; sliderPreview.clear(); sliderCommit.clear()
        slider.forceActiveFocus(); keyClick(Qt.Key_Right)
        compare(sourceValue, 0.5); compare(sliderCommit.count, 1)
        sourceValue = 0.2; compare(slider.value, 0.2)
        compare(sliderCommit.count, 1)
    }
    function test_slider_disable_during_drag() {
        sliderCancel.clear(); sliderCommit.clear()
        mousePress(slider, 20, slider.height / 2)
        mouseMove(slider, 80, slider.height / 2)
        slider.enabled = false
        compare(sliderCancel.count, 1); compare(sliderCommit.count, 0)
        mouseRelease(slider, 80, slider.height / 2)
        slider.enabled = true
    }
    function test_slider_reset() {
        sliderPreview.clear(); sliderCommit.clear(); slider.resetValue = 0.7
        slider.reset(); compare(sliderPreview.count, 1); compare(sliderCommit.count, 1)
        compare(sliderCommit.signalArguments[0][0], 0.7)
    }
    function test_slider_reset_double_tap() {
        compare(slider.resetOnDoubleTap, false)
        sourceValue = 0.5; slider.resetValue = 0.7; slider.resetOnDoubleTap = true
        sliderStart.clear(); sliderCommit.clear()
        mouseDoubleClickSequence(slider, slider.width / 2, slider.height / 2)
        tryVerify(() => sliderCommit.count > 0 && sliderCommit.signalArguments[sliderCommit.count - 1][0] === 0.7)
        compare(sliderCommit.count, 1)
        compare(sliderStart.count, 1)
        compare(sliderCommit.signalArguments[sliderCommit.count - 1][0], 0.7)
        sliderCommit.clear()
        mousePress(slider, 20, slider.height / 2)
        mouseMove(slider, 80, slider.height / 2)
        mouseRelease(slider, 80, slider.height / 2)
        wait(0)
        verify(sliderCommit.count > 0)
        verify(sliderCommit.signalArguments[sliderCommit.count - 1][0] !== 0.7)
        sourceValue = 0.2; sliderCommit.clear()
        mouseClick(slider, slider.width / 2, slider.height / 2)
        compare(sliderCommit.count, 0)
        tryCompare(sliderCommit, "count", 1)
        slider.resetOnDoubleTap = false
    }
    function test_slider_reset_tap_blur() {
        sourceValue = 0.2; slider.resetOnDoubleTap = true
        sliderCommit.clear()
        mouseClick(slider, slider.width / 2, slider.height / 2)
        compare(sliderCommit.count, 0)
        button.forceActiveFocus()
        compare(sliderCommit.count, 1)
        wait(Qt.styleHints.mouseDoubleClickInterval + 20)
        compare(sliderCommit.count, 1)
        slider.resetOnDoubleTap = false
    }
    function test_slider_reset_tap_disable() {
        sourceValue = 0.2; slider.resetOnDoubleTap = true
        sliderCommit.clear(); sliderCancel.clear()
        mouseClick(slider, slider.width / 2, slider.height / 2)
        compare(sliderCommit.count, 0)
        slider.enabled = false
        compare(sliderCancel.count, 1)
        wait(Qt.styleHints.mouseDoubleClickInterval + 20)
        compare(sliderCommit.count, 0)
        slider.enabled = true
        slider.resetOnDoubleTap = false
    }
    function test_slider_keyboard() {
        sliderPreview.clear(); sliderCommit.clear(); slider.forceActiveFocus(); keyClick(Qt.Key_Right)
        compare(sliderPreview.count, 1); compare(sliderCommit.count, 1)
    }
    function test_slider_keyboard_blur() {
        sliderCommit.clear(); sliderCancel.clear()
        slider.forceActiveFocus(); keyPress(Qt.Key_Right)
        verify(slider.editing)
        button.forceActiveFocus(); keyRelease(Qt.Key_Right)
        compare(slider.editing, false)
        compare(sliderCommit.count, 1)
        compare(sliderCancel.count, 0)
    }
    function test_slider_keyboard_disable() {
        sliderCommit.clear(); sliderCancel.clear()
        slider.forceActiveFocus(); keyPress(Qt.Key_Right)
        slider.enabled = false; keyRelease(Qt.Key_Right)
        compare(slider.editing, false)
        compare(sliderCommit.count, 0)
        compare(sliderCancel.count, 1)
        slider.enabled = true
    }
    function test_icon_only_density() {
        Ui.Theme.textScale = 1; compare(iconButton.implicitHeight, 28); compare(iconButton.implicitWidth, 28)
        Ui.Theme.textScale = 2; compare(iconButton.implicitHeight, 28); compare(iconButton.implicitWidth, 28)
    }
    function inkGaps(item, left, right) {
        const image = grabImage(item)
        const background = image.pixel(left, 3)
        let first = -1, last = -1
        for (let y = 3; y < Math.round(item.height) - 3; ++y) {
            for (let x = left; x < right; ++x) {
                const pixel = image.pixel(x, y)
                if (Math.abs(pixel.r - background.r) + Math.abs(pixel.g - background.g) + Math.abs(pixel.b - background.b) < 0.5) continue
                if (first < 0) first = y
                last = y
                break
            }
        }
        verify(first >= 0)
        return {above: first, below: Math.round(item.height) - 1 - last}
    }
    function test_button_label_is_centered_data() {
        return [{tag: "compact", density: Ui.EditorButton.Compact}, {tag: "standard", density: Ui.EditorButton.Standard},
                {tag: "comfortable", density: Ui.EditorButton.Comfortable}]
    }
    function test_button_label_is_centered(data) {
        centeredButton.visible = true
        centeredButton.density = data.density
        waitForRendering(centeredButton)
        const label = findChild(centeredButton, "nativeButtonLabel")
        const left = Math.round(label.mapToItem(centeredButton, 0, 0).x)
        const gaps = inkGaps(centeredButton, left, left + Math.round(label.width))
        centeredButton.visible = false
        verify(Math.abs(gaps.above - gaps.below) <= 1, "above " + gaps.above + ", below " + gaps.below)
    }
    function test_select_label_is_centered() {
        centeredSelect.visible = true
        waitForRendering(centeredSelect)
        const gaps = inkGaps(centeredSelect, Ui.Metrics.md, Ui.Metrics.md + 30)
        centeredSelect.visible = false
        verify(Math.abs(gaps.above - gaps.below) <= 1, "above " + gaps.above + ", below " + gaps.below)
    }
    function test_button_text_role() {
        button.textRole = Ui.Typography.MonoCaption
        const buttonLabel = findChild(button, "nativeButtonLabel")
        compare(buttonLabel.role, Ui.Typography.MonoCaption)
        compare(button.font.family, "JetBrains Mono")
        compare(button.font.pixelSize, 11)
        button.textRole = 99
        compare(button.textRole, Ui.Typography.SansLabel)
        button.textRole = Ui.Typography.SansLabel
    }
    function test_keyframe_icon() {
        tryCompare(keyframeIcon, "status", Image.Ready)
    }
    function test_invalid_typography_font_role() {
        const expected = Ui.Typography.font(Ui.Typography.SansBody)
        const fallback = Ui.Typography.font(99)
        compare(fallback.family, expected.family)
        compare(fallback.pixelSize, expected.pixelSize)
        compare(fallback.weight, expected.weight)
    }
    function test_checkbox() {
        checkChanges.clear(); check.checked = false; compare(checkChanges.count, 0)
        check.forceActiveFocus(); keyClick(Qt.Key_Space); compare(checkChanges.count, 1); verify(check.checked)
    }
    function test_checkbox_text_scale() {
        check.text = "Enable captions"
        Ui.Theme.textScale = 2
        verify(check.availableHeight >= check.contentItem.implicitHeight)
        check.text = ""
    }
    function test_toggle() {
        toggled.clear(); toggle.checked = false; compare(toggled.count, 0)
        mouseClick(toggle); compare(toggled.count, 1); verify(toggle.checked)
    }
    function test_toggle_text_scale() {
        toggle.text = "Enable captions"
        Ui.Theme.textScale = 2
        verify(toggle.availableHeight >= toggle.contentItem.implicitHeight)
        toggle.text = ""
    }
    function test_dialog() {
        button.forceActiveFocus(); dialog.open(); tryVerify(() => dialog.visible)
        keyClick(Qt.Key_Escape); tryVerify(() => !dialog.visible)
        verify(button.activeFocus)
    }
    function test_select_pointer() {
        selected.clear(); select.value = "a"; mouseClick(select)
        verify(select.popup.visible)
        const list = select.popup.contentItem
        tryVerify(() => list.contentHeight > 0)
        tryVerify(() => list.itemAtIndex(1) !== null)
        mouseClick(list.itemAtIndex(1))
        compare(selected.count, 1); compare(selected.signalArguments[0][0], "b")
    }
    function test_select_escape_and_readonly() {
        selected.clear(); select.value = "a"
        select.readOnly = true; select.forceActiveFocus(); keyClick(Qt.Key_Space)
        verify(!select.popup.visible)
        keyClick(Qt.Key_End); keyClick(Qt.Key_B)
        compare(selected.count, 0)
        compare(select.currentIndex, 0)
        select.readOnly = false; keyClick(Qt.Key_Space); verify(select.popup.visible)
        keyClick(Qt.Key_Escape); tryVerify(() => !select.popup.visible); verify(select.activeFocus)
    }
    function test_select_closed_skips_disabled() {
        select.options = [{label: "Alpha", value: "a"}, {label: "Blocked", value: "x", enabled: false}, {label: "Gamma", value: "c"}]
        select.value = "a"; selected.clear(); select.forceActiveFocus()
        keyClick(Qt.Key_Down)
        compare(selected.count, 1)
        compare(selected.signalArguments[0][0], "c")
        select.options = [{label: "Alpha", value: "a"}, {label: "Beta", value: "b"}]
    }
    function test_select_closed_search_skips_disabled() {
        select.options = [{label: "Alpha", value: "a"}, {label: "Blocked", value: "x", enabled: false}, {label: "Bright", value: "c"}]
        select.value = "a"; selected.clear(); select.forceActiveFocus()
        keyClick(Qt.Key_B)
        compare(selected.count, 1)
        compare(selected.signalArguments[0][0], "c")
        select.options = [{label: "Alpha", value: "a"}, {label: "Beta", value: "b"}]
    }
    function test_select_disabled_current() {
        select.options = [{label: "Blocked", value: "x", enabled: false}, {label: "Beta", value: "b"}]
        select.value = "x"; selected.clear(); select.forceActiveFocus()
        keyClick(Qt.Key_Space); verify(select.popup.visible)
        keyClick(Qt.Key_Return); compare(selected.count, 0)
        keyClick(Qt.Key_Escape)
        select.options = [{label: "Alpha", value: "a"}, {label: "Beta", value: "b"}]
        select.value = "a"
    }
    function test_select_disabled() {
        select.options = [{label: "Alpha", value: "a"}, {label: "Blocked", value: "x", enabled: false}, {label: "Beta", value: "b"}]
        select.value = "a"; selected.clear(); select.forceActiveFocus()
        keyClick(Qt.Key_Space); verify(select.popup.visible)
        keyClick(Qt.Key_Down); keyClick(Qt.Key_Return)
        compare(selected.count, 1); compare(selected.signalArguments[0][0], "b")
        select.options = [{label: "Alpha", value: "a"}, {label: "Beta", value: "b"}]
    }
    function test_select() {
        selected.clear(); select.value = "a"; select.forceActiveFocus()
        keyClick(Qt.Key_Space)
        verify(select.popup.visible)
        keyClick(Qt.Key_Down); keyClick(Qt.Key_Return)
        compare(selected.count, 1)
        compare(selected.signalArguments[0][0], "b")
        compare(select.value, "a")
    }
    function test_number_suffix_rtl() {
        number.unit = "px"; number.LayoutMirroring.enabled = true
        verify(number.leftPadding > number.rightPadding)
        number.LayoutMirroring.enabled = false
        verify(number.rightPadding > number.leftPadding)
        number.unit = ""
    }
    function test_number_display_value() {
        number.value = 5; number.displayValue = "5.00"; compare(number.text, "5.00")
        number.forceActiveFocus(); number.selectAll(); keyClick(Qt.Key_6)
        number.displayValue = "5.000"; compare(number.text, "6")
        keyClick(Qt.Key_Escape); compare(number.text, "5.000")
        number.displayValue = Qt.binding(() => String(number.value))
    }
    function test_number() {
        numberPreview.clear(); numberCommit.clear(); numberCancel.clear()
        number.forceActiveFocus(); number.selectAll(); keyClick(Qt.Key_Minus)
        verify(!number.draftValid); keyClick(Qt.Key_Return)
        compare(numberCommit.count, 0); compare(number.text, "-")
        compare(numberPreview.count, 0)
        keyClick(Qt.Key_Escape); compare(number.text, "5"); compare(numberCancel.count, 1)
        keyClick(Qt.Key_Up); compare(numberPreview.count, 1); compare(numberCommit.count, 1)
        compare(numberCommit.signalArguments[0][0], 6)
    }
    function test_number_deferred_typing() {
        number.previewWhileTyping = false
        number.value = 5
        numberPreview.clear(); numberCommit.clear()
        number.forceActiveFocus(); number.selectAll(); keyClick(Qt.Key_7)
        compare(numberPreview.count, 0); compare(numberCommit.count, 0)
        keyClick(Qt.Key_Return)
        compare(numberCommit.count, 1); compare(numberCommit.signalArguments[0][0], 7)
        numberPreview.clear(); numberCommit.clear()
        keyClick(Qt.Key_Up)
        compare(numberPreview.count, 1); compare(numberCommit.count, 1)
        number.previewWhileTyping = true
    }
    function test_area_programmatic() {
        areaStart.clear(); area.forceActiveFocus(); area.text = "programmatic"
        compare(areaStart.count, 0)
        area.value = "reset"
    }
    function test_area() {
        area.value = "initial"; areaStart.clear(); areaCommit.clear(); areaCancel.clear()
        area.forceActiveFocus(); area.selectAll(); keyClick(Qt.Key_A)
        compare(areaStart.count, 1)
        area.value = "external"
        compare(area.text, "a")
        keyClick(Qt.Key_Escape)
        compare(area.text, "external"); compare(areaCancel.count, 1); compare(areaCommit.count, 0)
        area.selectAll(); keyClick(Qt.Key_B); button.forceActiveFocus()
        compare(areaCommit.count, 1); compare(areaCommit.signalArguments[0][0], "b")
    }
    function test_field_accept() {
        accepted.clear(); field.valid = true; field.forceActiveFocus(); keyClick(Qt.Key_Return)
        compare(accepted.count, 1)
        field.valid = false; keyClick(Qt.Key_Return); compare(accepted.count, 1)
        field.valid = true
    }
    function test_field_preview_binding() {
        field.objectName = "live"; field.value = "initial"; fieldCommit.clear(); fieldCancel.clear()
        field.forceActiveFocus(); field.selectAll(); keyClick(Qt.Key_B)
        compare(field.value, "b")
        keyClick(Qt.Key_Return)
        compare(fieldCommit.count, 1); compare(fieldCancel.count, 0)
        field.objectName = ""
    }
    function test_invalid_blur() {
        number.value = 5; numberCancel.clear(); numberCommit.clear()
        number.forceActiveFocus(); number.selectAll(); keyClick(Qt.Key_Minus)
        button.forceActiveFocus()
        compare(number.text, "5"); compare(numberCancel.count, 1); compare(numberCommit.count, 0)
    }
    function test_field() {
        fieldStarted.clear(); fieldPreview.clear(); fieldCommit.clear(); fieldCancel.clear()
        field.forceActiveFocus(); field.selectAll(); keyClick(Qt.Key_A)
        compare(fieldStarted.count, 1); compare(fieldPreview.count, 1)
        field.value = "external"
        compare(field.text, "a")
        keyClick(Qt.Key_Escape)
        compare(field.text, "external"); compare(fieldCancel.count, 1); compare(fieldCommit.count, 0)
        field.selectAll(); keyClick(Qt.Key_B); keyClick(Qt.Key_Return)
        compare(fieldCommit.count, 1); compare(fieldCommit.signalArguments[0][0], "b")
    }
    function test_fader() {
        started.clear(); previews.clear(); commits.clear(); cancels.clear()
        fader.forceActiveFocus()
        keyClick(Qt.Key_Up)
        compare(started.count, 1); compare(previews.count, 1); compare(commits.count, 1)
        mousePress(fader, 10, 30)
        compare(started.count, 2)
        keyClick(Qt.Key_Escape)
        compare(cancels.count, 1)
        mouseRelease(fader, 10, 30)
        compare(commits.count, 1)
    }
    function test_fader_keyboard_blur() {
        commits.clear(); cancels.clear()
        fader.forceActiveFocus(); keyPress(Qt.Key_Up)
        verify(fader.editing)
        button.forceActiveFocus(); keyRelease(Qt.Key_Up)
        compare(fader.editing, false)
        compare(commits.count, 1)
        compare(cancels.count, 0)
    }
    function test_fader_keyboard_disable() {
        commits.clear(); cancels.clear()
        fader.forceActiveFocus(); keyPress(Qt.Key_Up)
        fader.enabled = false; keyRelease(Qt.Key_Up)
        compare(fader.editing, false)
        compare(commits.count, 0)
        compare(cancels.count, 1)
        fader.enabled = true
    }
    function test_narrow_button() {
        Ui.Theme.textScale = 2
        button.width = 65; button.contentAlignment = Qt.AlignLeft
        button.text = "A very long label for a narrow button"
        const label = findChild(button, "nativeButtonLabel")
        verify(label.width <= button.availableWidth)
        verify(label.truncated)
        button.trailingIconName = "arrowDropDown"
        const trailing = findChild(button, "nativeButtonTrailingIcon")
        verify(trailing.visible)
        verify(label.width + trailing.width <= button.availableWidth)
        button.LayoutMirroring.enabled = true
        wait(0)
        verify(trailing.x < label.x)
        verify(label.width + trailing.width <= button.availableWidth)
        button.LayoutMirroring.enabled = false
        button.trailingIconName = ""
        button.text = "Run"; button.width = button.implicitWidth
    }
    function test_disabled_tooltip() {
        width = 220
        Ui.Theme.textScale = 2
        button.x = 120; button.width = 90
        button.enabled = false
        button.disabledReason = "This action is unavailable while the selected media is still being prepared."
        const tip = findChild(button, "nativeButtonTooltip")
        mouseMove(button, 10, 10)
        tryVerify(() => tip.visible, 1500)
        compare(tip.text, button.disabledReason)
        verify(tip.x >= 0)
        verify(tip.x + tip.width <= tip.parent.width)
        verify(tip.y >= 0)
        verify(tip.y + tip.height <= tip.parent.height)
        verify(tip.contentItem.implicitHeight > Ui.Typography.pixelSize(Ui.Typography.SansCaption) * 1.4)
        mouseMove(button, -100, -100)
        button.enabled = true; button.disabledReason = ""
        button.x = 0; button.width = button.implicitWidth
        width = 400
    }
    function test_tooltip() {
        button.description = "A long descriptive tooltip"
        button.x = 0
        actionButton.forceActiveFocus()
        button.forceActiveFocus(Qt.TabFocusReason)
        const tip = findChild(button, "nativeButtonTooltip")
        verify(tip !== null)
        tryVerify(() => tip.visible, 1500)
        verify(tip.x >= 0)
        verify(tip.x + tip.width <= tip.parent.width)
        verify(tip.y >= 0)
        verify(tip.y + tip.height <= tip.parent.height)
        mouseMove(button, -100, -100)
        button.description = ""
        button.x = 0
    }
    function test_loading() {
        button.loading = true
        button.forceActiveFocus()
        mouseClick(button)
        keyClick(Qt.Key_Space)
        compare(clicked.count, 0)
        verify(button.activeFocus)
        button.loading = false
    }
    function test_loading_during_press() {
        clicked.clear(); button.loading = false
        button.enabled = Qt.binding(() => desiredButtonEnabled)
        button.forceActiveFocus()
        buttonFocusChanges.clear()
        mousePress(button); verify(button.down)
        button.loading = true; mouseRelease(button)
        compare(clicked.count, 0)
        compare(buttonFocusChanges.count, 0)
        wait(0)
        verify(button.activeFocus)
        verify(button.enabled)
        desiredButtonEnabled = false; verify(!button.enabled)
        desiredButtonEnabled = true; verify(button.enabled)
        button.loading = false
        button.enabled = true
    }
    function test_loading_during_space() {
        clicked.clear(); button.loading = false
        button.forceActiveFocus(); buttonFocusChanges.clear()
        const visualFocus = button.visualFocus
        keyPress(Qt.Key_Space); verify(button.down)
        button.loading = true; keyRelease(Qt.Key_Space)
        compare(clicked.count, 0)
        compare(buttonFocusChanges.count, 0)
        verify(button.activeFocus)
        compare(button.visualFocus, visualFocus)
        button.loading = false
        verify(!button.down)
        mouseClick(button)
        compare(clicked.count, 1)
        keyClick(Qt.Key_Space)
        compare(clicked.count, 2)
    }
    function test_loading_during_space_with_action() {
        testAction.enabled = true; testAction.checked = false
        actionButton.loading = false; actionTriggered.clear(); actionClicked.clear()
        actionButton.forceActiveFocus(); keyPress(Qt.Key_Space)
        actionButton.loading = true; keyRelease(Qt.Key_Space)
        compare(actionClicked.count, 0)
        compare(actionTriggered.count, 0)
        compare(testAction.checked, false)
        actionButton.loading = false
    }
    function test_loading_during_space_checkable() {
        button.checkable = true; button.checked = false; button.loading = false
        clicked.clear(); button.forceActiveFocus(); keyPress(Qt.Key_Space)
        button.loading = true; keyRelease(Qt.Key_Space)
        compare(clicked.count, 0)
        compare(button.checked, false)
        button.loading = false; button.checkable = false
    }
    function test_action() {
        testAction.checked = false
        mouseClick(actionButton)
        verify(testAction.checked)
        verify(actionButton.checked)
        testAction.enabled = false
        mouseClick(actionButton)
        verify(testAction.checked)
        testAction.enabled = true
        actionButton.forceActiveFocus()
        keyClick(Qt.Key_Return)
        verify(!testAction.checked)
        keyClick(Qt.Key_Enter)
        verify(testAction.checked)
    }
    function test_activation() {
        mouseClick(button)
        compare(clicked.count, 1)
        button.forceActiveFocus()
        keyClick(Qt.Key_Space)
        compare(clicked.count, 2)
        keyClick(Qt.Key_Return)
        compare(clicked.count, 3)
        keyClick(Qt.Key_Enter)
        compare(clicked.count, 4)
    }
}
