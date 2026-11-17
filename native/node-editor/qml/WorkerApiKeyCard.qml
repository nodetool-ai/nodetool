pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.NodeEditor

// Connects a worker provider inside the worker flow
// (web/src/components/workers/WorkerApiKeySetup.tsx). The key is checked with
// the provider before it is stored. Verda needs a client id and a secret, so
// it is set up in Settings.
Ui.Surface {
    id: root
    required property WorkerFleet fleet
    property string target: "runpod"
    readonly property string provider: root.fleet.providerLabel(target)
    readonly property bool singleKey: target === "runpod" || target === "vast"
    property bool saving: false
    property bool rejected: false
    property string saveError: ""
    implicitHeight: column.implicitHeight + Ui.Metrics.md * 2

    function save(force) {
        if (keyField.text.trim() === "" || saving) { return }
        saving = true
        saveError = ""
        fleet.saveApiKey(target, keyField.text, force)
    }
    Connections {
        target: root.fleet
        function onApiKeyFinished(target, result) {
            if (target !== root.target) { return }
            root.saving = false
            root.rejected = result === "rejected"
            root.saveError = result === "failed" ? "Could not save the key. Try again." : ""
            if (result === "saved") { keyField.text = "" }
        }
    }
    ColumnLayout {
        id: column
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.sm
        Ui.Text { text: "Add your " + root.provider + " API key"; role: Ui.Typography.SansLabel }
        Ui.Text {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            text: root.singleKey
                  ? "Workers run on your " + root.provider + " account and bill there. NodeTool checks the key, then stores it encrypted."
                  : root.provider + " signs in with a client id and a secret. Add both in Settings → Models & Providers."
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
        RowLayout {
            visible: root.singleKey
            Layout.fillWidth: true
            spacing: Ui.Metrics.xs
            Ui.TextField {
                id: keyField
                objectName: "workers-api-key-" + root.target
                Layout.fillWidth: true
                echoMode: TextInput.Password
                accessibleName: root.provider + " API key"
                placeholderText: "Paste your " + root.provider + " API key"
                valid: !root.rejected
                errorText: root.rejected ? "The provider rejected this key." : ""
                onTextChanged: root.rejected = false
                onAccepted: root.save(false)
            }
            Ui.EditorButton {
                text: "Save"
                variant: Ui.EditorButton.Outlined
                loading: root.saving
                enabled: keyField.text.trim() !== "" && !root.saving
                onClicked: root.save(false)
            }
        }
        Ui.EditorButton {
            visible: root.rejected
            text: "Save anyway"
            variant: Ui.EditorButton.Flat
            onClicked: root.save(true)
        }
        Ui.Status {
            visible: root.saveError !== ""
            Layout.fillWidth: true
            status: Ui.Status.Error
            message: root.saveError
        }
    }
}
