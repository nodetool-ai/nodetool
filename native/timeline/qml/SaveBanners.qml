// The save warnings of a server timeline, under the document bar where the
// web puts its ConflictBanner (TimelineEditor.tsx). Both are the warning
// Alert of ui_primitives/ConflictBanner.tsx.
//
// - Conflict (`autosave.conflict`): the server copy changed since the load.
//   The web merges and lists each conflicting change with Accept and
//   Discard. The native editor does not merge (D34), so it says that
//   autosave stopped, with `autosave.lastError`.
// - Stripped (`autosave.stripped`): the server dropped fields of the saved
//   document. The web has no such warning, so the wording here is new.
//
// A banner names a recovery copy only when the controller says where it is
// (`keptCopy`) or why it is missing (`recoveryError`). The controller does
// not expose these yet. Until it does, the banners claim no copy, and a
// failed copy shows only through `lastError`.
import QtQuick
import NodeTool.Timeline

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

    // A new strip warning shows again after a dismissed one.
    onStrippedPathsChanged: strippedDismissed = false

    component Alert: Rectangle {
        id: alert
        property string title
        property string detail
        property bool dismissible: false
        signal dismissed()
        width: banners.width
        height: Math.max(alertIcon.height, textColumn.implicitHeight) + 2 * Theme.spacingSm
        // MUI's standard warning Alert on the dark palette: the main colour
        // darkened 90 % behind text lightened 60 %.
        color: Qt.rgba(Theme.warning.r * 0.1, Theme.warning.g * 0.1, Theme.warning.b * 0.1, 1)
        Icon {
            id: alertIcon
            x: Theme.spacingXl
            y: Theme.spacingSm + 2
            size: 22
            path: Icons.reportProblem
            color: Theme.warning
        }
        Column {
            id: textColumn
            x: alertIcon.x + alertIcon.width + Theme.spacingLg
            y: Theme.spacingSm + 2
            width: alert.width - x - Theme.spacingXl - (alert.dismissible ? 32 : 0)
            spacing: Theme.spacingXs
            Text {
                objectName: "alertTitle"
                width: parent.width
                wrapMode: Text.WordWrap
                text: alert.title
                color: Qt.rgba(1, 0.89, 0.77, 1)
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeNormal
                font.weight: Font.Medium
            }
            Text {
                objectName: "alertDetail"
                visible: alert.detail !== ""
                width: parent.width
                wrapMode: Text.WordWrap
                text: alert.detail
                color: Qt.rgba(1, 0.89, 0.77, 1)
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmall
            }
        }
        ToolButton {
            visible: alert.dismissible
            anchors.right: parent.right
            anchors.rightMargin: Theme.spacingMd
            y: Theme.spacingSm
            label: "Close"
            iconOnly: true
            iconPath: Icons.close
            onClicked: alert.dismissed()
        }
    }

    Alert {
        objectName: "conflictBanner"
        visible: banners.showConflict
        title: "The timeline changed outside the editor. Autosave stopped, so your edits are not on the server."
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
