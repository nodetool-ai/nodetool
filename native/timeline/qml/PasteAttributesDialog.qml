import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Dialog {
    id: dialog
    property var source: ({})
    property var targets: []
    property var chosenGroups: []
    readonly property var groupOrder: ["motion", "opacity", "effects", "animations", "speed", "volume", "audioEffects"]
    readonly property var labels: ({
            motion: "Motion (position, scale, rotation, crop, corners)",
            opacity: "Opacity and blend mode",
            effects: "Video effects",
            animations: "Animations and keyframes",
            speed: "Speed",
            volume: "Volume",
            audioEffects: "Audio effects"
        })
    readonly property var availableGroups: groupOrder.filter(group => applies(group, source) && targets.some(target => applies(group, target)))
    signal groupsChosen(var groups)
    function applies(group, clip) {
        if (group === "speed")
            return clip.mediaType === "video" || clip.mediaType === "audio";
        if (group === "volume" || group === "audioEffects")
            return ["video", "audio", "midi"].includes(clip.mediaType);
        return clip.mediaType !== "audio" && clip.mediaType !== "midi";
    }
    function carries(group) {
        switch (group) {
        case "motion":
            return source.transform !== undefined || source.crop !== undefined || source.borderRadius !== undefined;
        case "opacity":
            return source.opacity !== undefined || source.blendMode !== undefined;
        case "effects":
            return (source.effects?.length ?? 0) > 0;
        case "animations":
            return (source.animations?.length ?? 0) > 0;
        case "speed":
            return (source.speedBaked ? 1 : Math.max(0.0001, source.speedMultiplier ?? 1)) !== 1;
        case "volume":
            return (source.volumeDb ?? 0) !== 0;
        case "audioEffects":
            return (source.audioEffects?.length ?? 0) > 0;
        }
        return false;
    }
    function resetChoices() {
        chosenGroups = availableGroups.filter(group => carries(group));
    }
    function toggleGroup(group) {
        if (!availableGroups.includes(group))
            return;
        chosenGroups = chosenGroups.includes(group) ? chosenGroups.filter(g => g !== group) : [...chosenGroups, group];
    }
    function confirm() {
        if (chosenGroups.length === 0)
            return;
        groupsChosen(chosenGroups);
        close();
    }
    onOpened: {
        resetChoices();
        pasteButton.forceActiveFocus();
    }
    title: "Paste attributes"
    modal: true
    width: Math.min(Ui.Metrics.dialogWidth, parent ? parent.width - 4 * Ui.Metrics.xl : Ui.Metrics.dialogWidth)
    height: Math.min(implicitHeight, parent ? Math.max(0, parent.height - 4 * Ui.Metrics.xl) : implicitHeight)
    focus: true
    closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
    header: Item {
        implicitHeight: titleText.implicitHeight + 2 * Ui.Metrics.lg
        Ui.Text {
            id: titleText
            objectName: "dialogTitle"
            x: Ui.Metrics.xl
            anchors.verticalCenter: parent.verticalCenter
            text: dialog.title
            role: Ui.Typography.SansTitle
        }
        Ui.ToolbarIconButton {
            objectName: "closeButton"
            anchors.right: parent.right
            anchors.rightMargin: Ui.Metrics.xl
            anchors.verticalCenter: parent.verticalCenter
            iconName: "close"
            accessibleName: "Close"
            onClicked: dialog.close()
        }
        Ui.Separator {
            anchors.bottom: parent.bottom
            width: parent.width
        }
    }
    contentItem: ScrollView {
        id: attributeScroll
        objectName: "attributeScroll"
        clip: true
        implicitHeight: contentColumn.implicitHeight
        contentHeight: contentColumn.implicitHeight
        contentWidth: availableWidth
        ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
        Column {
            id: contentColumn
            width: attributeScroll.availableWidth
            spacing: Ui.Metrics.sm
            Ui.Text {
                objectName: "fromCaption"
                text: "From \"" + (dialog.source.name ?? "") + "\""
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Disabled
                width: parent.width
                wrapMode: Text.Wrap
            }
            Ui.Text {
                objectName: "emptyCaption"
                visible: dialog.availableGroups.length === 0
                text: "The copied clip has nothing these clips can take."
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                width: parent.width
                wrapMode: Text.Wrap
            }
            Repeater {
                model: dialog.availableGroups
                delegate: Ui.CheckBox {
                    id: optionBox
                    width: contentColumn.width
                    required property string modelData
                    objectName: "group-" + modelData
                    text: dialog.labels[modelData]
                    Binding { target: optionBox; property: "checked"; value: dialog.chosenGroups.includes(optionBox.modelData) }
                    onCheckedChangedByUser: dialog.toggleGroup(modelData)
                }
            }
        }
    }
    footer: Row {
        spacing: Ui.Metrics.md
        padding: Ui.Metrics.lg
        layoutDirection: Qt.RightToLeft
        Ui.EditorButton {
            id: pasteButton
            objectName: "pasteButton"
            text: "Paste"
            enabled: dialog.chosenGroups.length > 0
            variant: Ui.EditorButton.Primary
            onClicked: dialog.confirm()
        }
        Ui.EditorButton {
            objectName: "cancelButton"
            text: "Cancel"
            onClicked: dialog.close()
        }
    }
}
