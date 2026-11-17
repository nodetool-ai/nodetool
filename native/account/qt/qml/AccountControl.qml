import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The Account control (native cloud PRD, "Sign in"). Signed out it reads
// Sign in. Signed in it shows the account name, and its menu signs out. While
// the browser is open it offers Cancel. The owner opens the browser when the
// account emits browserRequested.
//
// One file, compiled into the QML module of each app: NodeTool.NodeEditor
// shows it in the status bar, NodeTool.Timeline in the document bar. Each
// module registers AccountController.
RowLayout {
    id: root
    required property AccountController account
    readonly property int state: root.account.state
    readonly property bool signedIn: state === AccountController.SignedIn
    readonly property bool signingIn: state === AccountController.SigningIn
    spacing: Ui.Metrics.sm

    Ui.Text {
        objectName: "account-status"
        // Signed in, the button carries the name. Otherwise the sentence says
        // what is pending or why cloud features are off.
        visible: !root.signedIn && text !== "" && text !== "Not signed in"
        text: root.account.statusText
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Disabled
        tight: true
    }
    Ui.Text {
        objectName: "account-message"
        visible: text !== "" && !root.signingIn
        text: root.account.message
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Error
        tight: true
        elide: Text.ElideRight
        Layout.maximumWidth: Ui.Metrics.xxxl * 8
    }
    Ui.EditorButton {
        objectName: "account-sign-in"
        visible: !root.signedIn && !root.signingIn
        enabled: root.account.cloudAvailable
        text: "Sign in"
        iconName: "personOutline"
        variant: Ui.EditorButton.Flat
        density: Ui.EditorButton.Compact
        accessibleName: "Sign in to NodeTool Cloud"
        onClicked: root.account.signIn()
    }
    Ui.EditorButton {
        objectName: "account-cancel"
        visible: root.signingIn
        text: "Cancel sign-in"
        variant: Ui.EditorButton.Flat
        density: Ui.EditorButton.Compact
        onClicked: root.account.cancelSignIn()
    }
    Ui.MenuButton {
        id: accountButton
        objectName: "account-menu-button"
        visible: root.signedIn
        text: root.account.displayName
        iconName: "personOutline"
        variant: Ui.EditorButton.Flat
        density: Ui.EditorButton.Compact
        accessibleName: "Account " + root.account.displayName
        menu: accountMenu
        Ui.ContextMenu {
            id: accountMenu
            objectName: "account-menu"
            returnFocusTo: accountButton
            Ui.MenuItem {
                objectName: "account-server"
                text: root.account.serverOrigin
                enabled: false
            }
            Basic.MenuSeparator { padding: Ui.Metrics.xs; contentItem: Ui.Separator {} }
            Ui.MenuItem {
                objectName: "account-sign-out"
                text: "Sign out"
                onTriggered: root.account.signOut()
            }
        }
    }
}
