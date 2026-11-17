import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The Account control (native cloud PRD, "Sign in"). Signed out it reads
// Sign in. Signed in it shows the account name, and its menu signs out. While
// the browser is open it offers Cancel. The owner opens the browser when the
// account emits browserRequested.
//
// With `servers` set, a server menu lists the servers this computer signed in
// to, switches between them, and offers Sign in to another server…, which
// asks for the address before the browser opens.
//
// One file, compiled into the QML module of each app: NodeTool.NodeEditor
// shows it in the status bar, NodeTool.Timeline in the document bar. Each
// module registers AccountController and AccountServers.
RowLayout {
    id: root
    required property AccountController account
    property AccountServers servers: null
    readonly property int state: root.account.state
    readonly property bool signedIn: state === AccountController.SignedIn
    readonly property bool signingIn: state === AccountController.SigningIn
    spacing: Ui.Metrics.sm

    // The name a server shows in the menu: NodeTool Cloud for the default,
    // otherwise its host.
    function serverLabel(origin) {
        if (root.servers && origin === root.servers.defaultServer)
            return "NodeTool Cloud"
        return origin.replace(/^https:\/\//, "")
    }

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
    Ui.MenuButton {
        id: serverButton
        objectName: "account-server-button"
        visible: root.servers !== null && !root.signingIn
        text: root.servers ? root.serverLabel(root.servers.currentServer) : ""
        variant: Ui.EditorButton.Flat
        density: Ui.EditorButton.Compact
        accessibleName: "Server " + text
        menu: serverMenu
        Ui.ContextMenu {
            id: serverMenu
            objectName: "account-server-menu"
            returnFocusTo: serverButton
            Instantiator {
                model: root.servers ? root.servers.servers : []
                delegate: Ui.MenuItem {
                    required property string modelData
                    objectName: "account-server-" + modelData
                    text: root.serverLabel(modelData)
                    checkable: true
                    checked: root.servers !== null && modelData === root.servers.currentServer
                    onTriggered: root.servers.switchTo(modelData)
                }
                onObjectAdded: (index, item) => serverMenu.insertItem(index, item)
                onObjectRemoved: (index, item) => serverMenu.removeItem(item)
            }
            Basic.MenuSeparator { padding: Ui.Metrics.xs; contentItem: Ui.Separator {} }
            Ui.MenuItem {
                objectName: "account-add-server"
                text: "Sign in to another server…"
                onTriggered: {
                    serverAddress.text = ""
                    serverError.text = ""
                    serverDialog.open()
                }
            }
        }
    }
    Ui.EditorButton {
        objectName: "account-sign-in"
        visible: !root.signedIn && !root.signingIn
        enabled: root.account.cloudAvailable
        text: "Sign in"
        iconName: "personOutline"
        variant: Ui.EditorButton.Flat
        density: Ui.EditorButton.Compact
        accessibleName: root.servers ? "Sign in to " + root.serverLabel(root.servers.currentServer) : "Sign in to NodeTool Cloud"
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

    // Asks for the address first (PRD "Sign in" step 2). A refused address
    // keeps the dialog open with the reason.
    Ui.Dialog {
        id: serverDialog
        objectName: "account-server-dialog"
        title: "Sign in to another server"
        width: Ui.Metrics.dialogCompactWidth
        returnFocusTo: serverButton
        function submit() {
            const reason = root.servers.addServer(serverAddress.text)
            serverError.text = reason
            if (reason !== "") {
                serverAddress.forceActiveFocus()
                return
            }
            serverDialog.close()
            // The control now shows the new server's account.
            root.servers.current.signIn()
        }
        onOpened: serverAddress.forceActiveFocus()
        ColumnLayout {
            width: parent.width
            spacing: Ui.Metrics.md
            Ui.TextField {
                id: serverAddress
                objectName: "account-server-address"
                Layout.fillWidth: true
                placeholderText: "nodetool.example.com"
                accessibleName: "Server address"
                valid: serverError.text === ""
                errorText: serverError.text
                onAccepted: serverDialog.submit()
            }
            Ui.Text {
                id: serverError
                objectName: "account-server-error"
                Layout.fillWidth: true
                visible: text !== ""
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Error
                wrapMode: Text.Wrap
            }
            RowLayout {
                Layout.alignment: Qt.AlignRight
                Ui.EditorButton {
                    objectName: "account-server-cancel"
                    text: "Cancel"
                    onClicked: serverDialog.close()
                }
                Ui.EditorButton {
                    objectName: "account-server-continue"
                    text: "Continue in browser"
                    variant: Ui.EditorButton.Primary
                    enabled: serverAddress.text.trim() !== ""
                    onClicked: serverDialog.submit()
                }
            }
        }
    }
}
