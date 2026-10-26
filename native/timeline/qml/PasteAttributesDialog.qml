import QtQuick
import QtQuick.Controls
import NodeTool.Timeline

Dialog {
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
    width: Math.min(600, parent ? parent.width - 4 * Theme.spacingXl : 600) // web Dialog maxWidth="sm"
    x: parent ? (parent.width - width) / 2 : 0
    y: parent ? (parent.height - height) / 2 : 0
    height: Math.min(implicitHeight, parent ? Math.max(0, parent.height - 4 * Theme.spacingXl) : implicitHeight)
    padding: Theme.spacingXl
    leftPadding: Theme.spacingXl + Theme.spacingMd
    rightPadding: Theme.spacingXl + Theme.spacingMd
    focus: true
    closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmall
    palette.text: Theme.textPrimary
    palette.windowText: Theme.textPrimary
    palette.buttonText: Theme.textPrimary
    palette.highlight: Theme.primary
    background: Rectangle {
        color: Theme.backgroundPaper
        radius: Theme.radiusLg
        border.color: Theme.divider
        border.width: 1
    }
    header: Item {
        implicitHeight: titleText.implicitHeight + 2 * Theme.spacingLg
        Text {
            id: titleText
            objectName: "dialogTitle"
            x: Theme.spacingXl + Theme.spacingMd
            anchors.verticalCenter: parent.verticalCenter
            text: dialog.title
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: 18 // fontSizeBig, ThemeNodetool.tsx
            font.weight: Font.DemiBold
        }
        Button {
            objectName: "closeButton"
            anchors.right: parent.right
            anchors.rightMargin: Theme.spacingXl + Theme.spacingMd
            anchors.verticalCenter: parent.verticalCenter
            width: Theme.controlXs
            height: Theme.controlXs
            text: "×"
            Accessible.name: "Close"
            ToolTip.text: "Close"
            ToolTip.visible: hovered
            onClicked: dialog.close()
            contentItem: Text {
                text: parent.text
                color: Theme.textSecondary
                horizontalAlignment: Text.AlignHCenter
                verticalAlignment: Text.AlignVCenter
                font.pixelSize: Theme.iconSm
            }
            background: Rectangle {
                color: parent.hovered ? Theme.actionHover : "transparent"
                radius: Theme.radiusSm
            }
        }
        Rectangle {
            anchors.bottom: parent.bottom
            width: parent.width
            height: 1
            color: Theme.divider
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
            spacing: Theme.spacingSm
            Text {
                objectName: "fromCaption"
                text: "From \"" + (dialog.source.name ?? "") + "\""
                color: Theme.textDisabled
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmaller
                width: parent.width
                wrapMode: Text.Wrap
            }
            Text {
                objectName: "emptyCaption"
                visible: dialog.availableGroups.length === 0
                text: "The copied clip has nothing these clips can take."
                color: Theme.textSecondary
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmaller
                width: parent.width
                wrapMode: Text.Wrap
            }
            Repeater {
                model: dialog.availableGroups
                delegate: CheckBox {
                    id: optionBox
                    width: contentColumn.width
                    required property string modelData
                    objectName: "group-" + modelData
                    text: dialog.labels[modelData]
                    checked: dialog.chosenGroups.includes(modelData)
                    onClicked: dialog.toggleGroup(modelData)
                    font.family: Theme.sansFamily
                    font.pixelSize: Theme.fontSizeNormal
                    font.weight: Font.Normal
                    implicitHeight: Math.max(Theme.toolbarHeight + Theme.spacingMicro, contentItem.implicitHeight)
                    padding: 0
                    spacing: Theme.spacingMd
                    indicator: Rectangle {
                        implicitWidth: Theme.controlXs - Theme.spacingXs
                        implicitHeight: implicitWidth
                        y: (optionBox.height - height) / 2
                        radius: Theme.radiusXs
                        color: optionBox.checked ? Theme.primary : Theme.backgroundPaper
                        border.width: 2
                        border.color: optionBox.checked ? Theme.primary : Theme.textSecondary
                        Text {
                            anchors.centerIn: parent
                            visible: optionBox.checked
                            text: "✓"
                            color: Theme.textPrimary
                            font.pixelSize: Theme.iconSm
                            font.weight: Font.Medium
                        }
                    }
                    contentItem: Text {
                        text: optionBox.text
                        font: optionBox.font
                        color: Theme.textPrimary
                        leftPadding: optionBox.indicator.width + optionBox.spacing
                        verticalAlignment: Text.AlignVCenter
                        wrapMode: Text.Wrap
                        lineHeight: 1.5
                    }
                }
            }
        }
    }
    footer: Row {
        spacing: Theme.spacingMd
        padding: Theme.spacingLg
        leftPadding: Theme.spacingXl + Theme.spacingMd
        rightPadding: Theme.spacingXl + Theme.spacingMd
        layoutDirection: Qt.RightToLeft
        Button {
            id: pasteButton
            objectName: "pasteButton"
            text: "Paste"
            enabled: dialog.chosenGroups.length > 0
            onClicked: dialog.confirm()
            Keys.onReturnPressed: dialog.confirm()
            Keys.onEnterPressed: dialog.confirm()
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            font.weight: Font.Medium
            implicitHeight: Theme.toolbarHeight
            leftPadding: Theme.spacingXl
            rightPadding: Theme.spacingXl
            background: Rectangle {
                color: parent.enabled ? Theme.primary : Theme.actionDisabled
                radius: Theme.radiusSm
            }
        }
        Button {
            objectName: "cancelButton"
            text: "Cancel"
            onClicked: dialog.close()
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            font.weight: Font.Medium
            implicitHeight: Theme.toolbarHeight
            leftPadding: Theme.spacingXl
            rightPadding: Theme.spacingXl
            background: Rectangle {
                color: parent.hovered ? Theme.actionHover : "transparent"
                radius: Theme.radiusSm
            }
        }
    }
}
