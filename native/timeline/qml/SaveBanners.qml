// The save warnings of a server timeline, under the document bar where the
// web puts its ConflictBanner (TimelineEditor.tsx). Both are the warning
// Alert of ui_primitives/ConflictBanner.tsx.
//
// - Conflict (`autosave.conflict`): the server copy changed since the load.
//   The web merges and lists each conflicting change with Accept and
//   Discard. The native editor does not merge (D34), so it says that
//   server saving stopped, while committed edits keep updating a local copy.
// - Earlier (`autosave.earlierCopy`): Restore is one undo entry. The file
//   stays available after acknowledgement until explicit Discard.
// - Stripped (`autosave.stripped`): the server dropped fields of the saved
//   document. The web has no such warning, so the wording here is new.
//
// A banner names a recovery copy only when the controller says where it is
// (`keptCopy`) or why it is missing (`recoveryError`). The named copy always
// contains the current document, including fields stripped by the server.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Column {
    id: banners
    objectName: "saveBanners"
    property QtObject autosave: null
    property bool strippedDismissed: false

    readonly property bool showConflict: autosave !== null && autosave.conflict
    readonly property var strippedPaths: autosave !== null ? autosave.stripped : []
    readonly property bool showStripped: strippedPaths.length > 0 && !strippedDismissed
    // Optional controller properties (see above): empty when absent.
    readonly property string keptCopy: autosave !== null && autosave.keptCopy !== undefined ? autosave.keptCopy : ""
    readonly property string recoveryError: autosave !== null && autosave.recoveryError !== undefined
                                            ? autosave.recoveryError : ""
    readonly property string copySentence: keptCopy !== "" ? " A copy of your edits is in " + keptCopy + "."
        : recoveryError !== "" ? " The copy of your edits could not be written: " + recoveryError + "." : ""

    readonly property string earlierCopy: autosave !== null && autosave.earlierCopy !== undefined ? autosave.earlierCopy : ""
    readonly property string earlierCopyError: autosave !== null && autosave.earlierCopyError !== undefined
                                               ? autosave.earlierCopyError : ""
    readonly property bool restoringEarlier: autosave !== null && autosave.restoringEarlier === true

    function editorAbove() {
        let item = parent
        while (item) {
            if (item.timeline !== undefined && item.clock !== undefined) return item
            item = item.parent
        }
        return null
    }

    component RecoveryAction: Ui.EditorButton {
        density: Ui.EditorButton.Compact
        variant: Ui.EditorButton.Flat
        textTone: Ui.Text.Warning
        accessibleName: text
    }

    // A new strip warning shows again after a dismissed one.
    onStrippedPathsChanged: strippedDismissed = false

    component Alert: Rectangle {
        id: alert
        property string title
        property string detail
        property bool dismissible: false
        property bool recoveryActions: false
        signal dismissed()
        width: banners.width
        height: Math.max(alertIcon.height, textColumn.implicitHeight) + 2 * Ui.Metrics.sm
        // MUI's standard warning Alert on the dark palette: the main colour
        // darkened 90 % behind text lightened 60 %.
        color: Ui.Theme.statusWarningSurface
        Ui.Icon {
            id: alertIcon
            x: Ui.Metrics.xl
            y: Ui.Metrics.sm + Ui.Metrics.micro
            size: Ui.Metrics.iconLg
            name: "reportProblem"
            tone: Ui.Text.Warning
        }
        Column {
            id: textColumn
            x: alertIcon.x + alertIcon.width + Ui.Metrics.lg
            y: Ui.Metrics.sm + Ui.Metrics.micro
            width: alert.width - x - Ui.Metrics.xl - (alert.dismissible ? Ui.Metrics.xxxl : 0)
            spacing: Ui.Metrics.xs
            Ui.Text {
                objectName: "alertTitle"
                width: parent.width
                wrapMode: Text.WordWrap
                text: alert.title
                role: Ui.Typography.SansBody
                domainColor: Ui.Theme.statusWarningOnSurface
            }
            Ui.Text {
                objectName: "alertDetail"
                visible: alert.detail !== ""
                width: parent.width
                wrapMode: Text.WordWrap
                text: alert.detail
                role: Ui.Typography.SansLabel
                domainColor: Ui.Theme.statusWarningOnSurface
            }
            Row {
                visible: alert.recoveryActions
                spacing: Ui.Metrics.sm
                RecoveryAction {
                    objectName: "restoreEarlierCopyButton"
                    text: banners.restoringEarlier ? "Loading media…" : "Restore"
                    enabled: !banners.restoringEarlier
                    onClicked: {
                        const editor = banners.editorAbove()
                        if (editor && banners.autosave) banners.autosave.restoreEarlierCopy(editor.timeline)
                    }
                }
                RecoveryAction {
                    objectName: "discardEarlierCopyButton"
                    text: "Discard"
                    enabled: !banners.restoringEarlier
                    onClicked: if (banners.autosave) banners.autosave.discardEarlierCopy()
                }
            }
        }
        ToolButton {
            visible: alert.dismissible
            anchors.right: parent.right
            anchors.rightMargin: Ui.Metrics.md
            y: Ui.Metrics.sm
            label: "Close"
            iconOnly: true
            iconName: "close"
            onClicked: alert.dismissed()
        }
    }

    Alert {
        objectName: "earlierCopyBanner"
        visible: banners.earlierCopy !== ""
        recoveryActions: true
        title: "An earlier session left unsaved edits."
        detail: banners.earlierCopy + ". Restore replaces the timeline content as one undo step. "
                + "The copy stays until you discard it."
                + (banners.restoringEarlier ? " Loading media…" : "")
                + (banners.earlierCopyError !== "" ? " " + banners.earlierCopyError : "")
    }
    Alert {
        objectName: "conflictBanner"
        visible: banners.showConflict
        title: banners.keptCopy !== ""
               ? "The timeline changed outside the editor. Your edits are saved locally. Later edits update this copy after a short delay."
               : "The timeline changed outside the editor. Server saving is paused."
        detail: banners.autosave !== null ? banners.autosave.lastError + banners.copySentence : ""
    }
    Alert {
        objectName: "strippedBanner"
        visible: banners.showStripped
        dismissible: true
        title: banners.strippedPaths.length === 1
               ? "The server did not keep 1 field of the saved timeline."
               : "The server did not keep " + banners.strippedPaths.length + " fields of the saved timeline."
        detail: banners.strippedPaths.join(", ") + "." + banners.copySentence
        onDismissed: banners.strippedDismissed = true
    }
}
