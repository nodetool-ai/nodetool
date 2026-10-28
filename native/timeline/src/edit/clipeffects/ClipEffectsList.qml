pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import "ClipEffectsCatalog.js" as Catalog
import "../inspectorsections" as Sections

InspectorSection {
    id: root
    objectName: "clipEffectsList"
    property var timelineModel: null
    property var gestures: null
    property var controller: null
    readonly property var clip: effectEdits.clip
    readonly property var listed: effectEdits.effects.filter(effect => effect.id !== "inspector:color")
    readonly property string identity: JSON.stringify(listed.map(effect => effect.id))
    property string expandedId: ""
    title: "Effects"
    icon: "✧"
    meta: listed.length ? listed.filter(effect => effect.enabled).length + "/" + listed.length + " active" : ""
    defaultOpen: false
    open: ClipEffectsUi.folds.effects ?? false
    visible: effectEdits.visual
    onToggled: next => ClipEffectsUi.setFold("effects", next)
    onIdentityChanged: syncRows()
    Component.onCompleted: syncRows()
    ClipEffectsEdits {
        id: effectEdits
        timelineModel: root.timelineModel
        controller: root.controller
    }
    Connections {
        target: ClipEffectsUi
        function onFoldsChanged() {
            root.open = ClipEffectsUi.folds.effects ?? false;
        }
    }
    ListModel {
        id: rows
    }
    // Parameter previews keep the same delegates and pointer grab. Only IDs
    // trigger this reconciliation, including an external document replacement.
    function syncRows() {
        if (!rows)
            return;
        const ids = JSON.parse(identity);
        const wanted = new Set(ids);
        for (let i = rows.count - 1; i >= 0; --i) {
            if (!wanted.has(rows.get(i).effectId))
                rows.remove(i);
        }
        for (let i = 0; i < ids.length; ++i) {
            if (i < rows.count && rows.get(i).effectId === ids[i])
                continue;
            let from = i + 1;
            while (from < rows.count && rows.get(from).effectId !== ids[i])
                ++from;
            if (from < rows.count)
                rows.move(from, i, 1);
            else
                rows.insert(i, {
                    effectId: ids[i]
                });
        }
    }
    Sections.InspectorActionButton {
        id: add
        objectName: "effectsAdd"
        text: "+ Add effect"
        outlined: false
        enabled: !effectEdits.locked
        Accessible.name: "Add effect"
        onClicked: {
            search.text = "";
            popup.open();
        }
        Controls.Popup {
            id: popup
            y: add.height
            width: Math.max(root.width - InspectorTokens.sectionIndent, InspectorTokens.rowControlMinWidth * 2)
            padding: Theme.spacingMd
            closePolicy: Controls.Popup.CloseOnEscape | Controls.Popup.CloseOnPressOutside
            onOpened: search.forceActiveFocus()
            background: Rectangle {
                color: Theme.backgroundPaper
                radius: Theme.radiusMd
                border.width: 1
                border.color: Theme.overlayStrong
            }
            contentItem: Column {
                spacing: Theme.spacingMd
                Accessible.role: Accessible.Dialog
                Accessible.name: "Add effect"
                Controls.TextField {
                    id: search
                    objectName: "effectsSearch"
                    width: parent.width
                    implicitHeight: InspectorTokens.controlSm
                    placeholderText: "Search effects"
                    Accessible.name: "Search effects"
                    font.family: Theme.sansFamily
                    font.pixelSize: Theme.fontSizeSmall
                    color: Theme.textPrimary
                    background: Rectangle {
                        color: Theme.backgroundDefault
                        radius: Theme.radiusSm
                        border.width: 1
                        border.color: search.activeFocus ? Theme.primary : Theme.overlayStrong
                    }
                }
                Column {
                    width: parent.width
                    Repeater {
                        model: Catalog.addableEffects.filter(effect => effect.label.toLowerCase().includes(search.text.trim().toLowerCase()))
                        delegate: Sections.InspectorActionButton {
                            required property var modelData
                            objectName: "effectsAdd_" + modelData.value
                            width: parent.width
                            outlined: false
                            text: modelData.label
                            contentItem: Text {
                                text: parent.text
                                font: parent.font
                                color: Theme.textPrimary
                                verticalAlignment: Text.AlignVCenter
                            }
                            onClicked: {
                                root.expandedId = effectEdits.add(modelData.value);
                                popup.close();
                                search.text = "";
                            }
                        }
                    }
                    Sections.InspectorCaption {
                        width: parent.width
                        visible: Catalog.addableEffects.filter(effect => effect.label.toLowerCase().includes(search.text.trim().toLowerCase())).length === 0
                        text: "No matching effects"
                    }
                }
            }
        }
    }
    Sections.InspectorCaption {
        width: parent.width
        visible: root.listed.length === 0
        text: "Add a blur, glow, shadow, vignette, chroma key or grade."
    }
    Repeater {
        model: rows
        delegate: EffectRow {
            width: parent.width
            editor: effectEdits
            expanded: root.expandedId === effectId
            onExpand: root.expandedId = expanded ? "" : effectId
        }
    }
}
