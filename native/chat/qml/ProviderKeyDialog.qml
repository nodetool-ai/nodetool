pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// Adds a cloud provider's API key inside the app. The composer's model menu
// finds this dialog by its object name, and a host without it opens the web
// settings instead.
Ui.Dialog {
    id: root
    required property var session
    objectName: "providerSettingsDialog"
    title: qsTr("Add an API key")
    width: Math.min(460 * Ui.Theme.uiScale, (parent ? parent.width : 460) - Ui.Metrics.xl * 2)
    property string provider: ""
    readonly property var rows: session ? session.providerKeys : []
    readonly property var current: {
        for (let i = 0; i < rows.length; ++i) {
            if (rows[i].provider === provider) return rows[i]
        }
        return rows.length > 0 ? rows[0] : null
    }
    // A model menu row for one provider opens the dialog on that provider.
    function preselect(id) {
        if (id) provider = id
    }
    onAboutToShow: {
        keyField.text = ""
        if (session) session.loadProviderKeys()
    }
    onOpened: keyField.forceActiveFocus()
    function save() {
        if (!current || keyField.text.trim() === "") return
        session.saveProviderKey(current.key, keyField.text)
    }
    Connections {
        target: root.session
        ignoreUnknownSignals: true
        function onProviderKeySaved() {
            keyField.text = ""
            root.close()
        }
    }
    ColumnLayout {
        width: parent.width
        spacing: Ui.Metrics.md
        Ui.Text {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            tone: Ui.Text.Secondary
            text: qsTr("Paste a key from your account with an AI provider. It is kept on your NodeTool server, and the provider's models then appear in the model menu.")
        }
        Ui.Text { text: qsTr("Provider"); role: Ui.Typography.SansLabel }
        Ui.Select {
            objectName: "providerKeyProvider"
            Layout.fillWidth: true
            Layout.minimumWidth: 0
            accessibleName: qsTr("Provider")
            value: root.current ? root.current.provider : ""
            options: root.rows.map(row => ({ label: row.configured ? qsTr("%1 (connected)").arg(row.name) : row.name, value: row.provider }))
            onValueCommitted: selected => root.provider = selected
        }
        Ui.Text { text: qsTr("API key"); role: Ui.Typography.SansLabel }
        Ui.TextField {
            id: keyField
            objectName: "providerKeyValue"
            Layout.fillWidth: true
            accessibleName: qsTr("API key")
            echoMode: TextInput.Password
            placeholderText: root.current ? root.current.key : ""
            onAccepted: root.save()
        }
        Ui.Text {
            Layout.fillWidth: true
            visible: text !== ""
            wrapMode: Text.WordWrap
            text: root.session ? root.session.providerKeyStatus : ""
            tone: Ui.Text.Secondary
        }
        RowLayout {
            Layout.alignment: Qt.AlignRight
            spacing: Ui.Metrics.md
            Ui.EditorButton { text: qsTr("Cancel"); onClicked: root.close() }
            Ui.EditorButton {
                objectName: "providerKeySave"
                text: qsTr("Save key")
                variant: Ui.EditorButton.Primary
                enabled: !!root.current && keyField.text.trim() !== ""
                onClicked: root.save()
            }
        }
    }
}
