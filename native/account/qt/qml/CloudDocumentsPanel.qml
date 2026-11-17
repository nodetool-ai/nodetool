import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The Cloud and Shared with me groups of a document browser (PRD "Open and
// edit a cloud document", FR9). The app shows its On this computer group
// beside them and opens a document when the panel asks.
ColumnLayout {
    id: root
    required property CloudBrowser browser
    // A row was chosen. `role` is owner, editor or viewer.
    signal openRequested(string kind, string documentId, string name, string role)
    spacing: Ui.Metrics.sm

    component Group: ColumnLayout {
        id: group
        required property string title
        required property string emptyText
        required property CloudDocumentList documents
        required property string listName
        Layout.fillWidth: true
        spacing: Ui.Metrics.xs
        Ui.PanelHeader { text: group.title; Layout.fillWidth: true }
        Ui.Text {
            objectName: group.listName + "-empty"
            visible: root.browser.signedIn && !root.browser.loading && group.documents.count === 0
            text: group.emptyText
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            Layout.fillWidth: true
            wrapMode: Text.Wrap
        }
        ListView {
            objectName: group.listName
            Layout.fillWidth: true
            Layout.preferredHeight: contentHeight
            interactive: false
            model: group.documents
            reuseItems: true
            delegate: Ui.ListRow {
                required property string kind
                required property string documentId
                required property string name
                required property string access
                width: ListView.view.width
                text: name
                accessibleName: access === "owner" ? name : name + ", " + access
                onClicked: root.openRequested(kind, documentId, name, access)
                RowLayout {
                    width: parent.width
                    Ui.Text { text: name; role: Ui.Typography.SansLabel; elide: Text.ElideRight; Layout.fillWidth: true }
                    Ui.Text {
                        visible: access === "viewer"
                        text: "View only"
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                }
            }
        }
    }

    RowLayout {
        Layout.fillWidth: true
        Ui.Text {
            objectName: "cloud-documents-signed-out"
            visible: !root.browser.signedIn
            text: "Sign in to see your cloud documents and the ones shared with you."
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            wrapMode: Text.Wrap
            Layout.fillWidth: true
        }
        Ui.Status {
            objectName: "cloud-documents-message"
            visible: root.browser.message !== ""
            status: Ui.Status.Warning
            message: root.browser.message
            wrap: true
            Layout.fillWidth: true
        }
        Item { Layout.fillWidth: true; visible: root.browser.signedIn && root.browser.message === "" }
        Ui.ToolbarIconButton {
            objectName: "cloud-documents-refresh"
            visible: root.browser.signedIn
            iconName: "refresh"
            text: "Refresh cloud documents"
            loading: root.browser.loading
            onClicked: root.browser.refresh()
        }
    }
    Group {
        title: "Cloud"
        emptyText: "No documents in the cloud yet."
        documents: root.browser.cloud
        listName: "cloud-documents"
    }
    Group {
        title: "Shared with me"
        emptyText: "Nothing has been shared with you."
        documents: root.browser.shared
        listName: "shared-documents"
    }
}
