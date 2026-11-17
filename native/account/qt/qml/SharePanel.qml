pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The share panel of a cloud document the account owns (PRD FR21, FR52,
// FR67, SR6): the viewer and editor links with what each gives, the people
// who joined, the scripts and storyboards it links to, and a best-effort
// warning about values that look like secrets. ShareDialog shows it in a
// dialog. The node editor shows it in its overlay dialog window.
Rectangle {
    id: root
    required property AccountController account
    // `workflow` or `timeline`.
    required property string kind
    required property string documentId
    // The document JSON as the tab shows it (CloudDocument.content()).
    property string content: ""
    // The space inside the frame. A dialog that frames the panel sets 0.
    property real margin: Ui.Metrics.xl
    signal closeRequested()
    color: Ui.Theme.surfaceOverlay
    border.color: Ui.Theme.borderControl
    border.width: Ui.Metrics.border
    radius: Ui.Metrics.radiusOverlay
    implicitWidth: Ui.Metrics.dialogWidth
    implicitHeight: body.implicitHeight + margin * 2
    // Reads the links again, for a panel shown a second time.
    function reload() {
        root.controller.content = root.content
        root.controller.refresh()
    }
    onContentChanged: root.controller.content = root.content

    // The panel's own controller. A test passes one with its transport.
    property ShareController controller: ShareController {
        account: root.account
        kind: root.kind
        content: root.content
        documentId: root.documentId
    }

    // Copies through a text field, so the dialog needs no clipboard type.
    TextEdit { id: clipboard; visible: false }
    function copy(text: string, note: string) {
        clipboard.text = text
        clipboard.selectAll()
        clipboard.copy()
        copied.text = note ? note : "Link copied."
    }

    component LinkSection: ColumnLayout {
        id: section
        required property string title
        required property string linkRole
        required property var link
        Layout.fillWidth: true
        spacing: Ui.Metrics.xs
        Ui.PanelHeader { text: section.title; Layout.fillWidth: true }
        Ui.Text {
            objectName: "share-" + section.linkRole + "-statement"
            text: section.link.statement
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            wrapMode: Text.Wrap
            Layout.fillWidth: true
        }
        RowLayout {
            visible: section.link.exists
            Layout.fillWidth: true
            spacing: Ui.Metrics.sm
            Ui.TextField {
                objectName: "share-" + section.linkRole + "-url"
                value: section.link.url
                readOnly: true
                accessibleName: section.title + " address"
                Layout.fillWidth: true
            }
            Ui.EditorButton {
                objectName: "share-" + section.linkRole + "-copy"
                text: "Copy link"
                variant: Ui.EditorButton.Primary
                onClicked: root.copy(section.link.url, "")
            }
            Ui.EditorButton {
                objectName: "share-" + section.linkRole + "-disable"
                text: "Disable"
                description: "People who joined keep their access. Nobody new can join."
                enabled: !root.controller.busy
                onClicked: root.controller.disableLink(section.linkRole)
            }
        }
        Ui.EditorButton {
            objectName: "share-" + section.linkRole + "-create"
            visible: !section.link.exists
            text: section.linkRole === "editor" ? "Create editor link" : "Create viewer link"
            enabled: !root.controller.busy && !root.controller.loading && root.controller.message === ""
            onClicked: root.controller.createLink(section.linkRole)
        }
    }

    Ui.ScrollArea {
        anchors.fill: parent
        anchors.margins: root.margin
        ColumnLayout {
            id: body
            width: parent.width
            spacing: Ui.Metrics.lg

            Ui.Banner {
                objectName: "share-secret-warning"
                visible: root.controller.secretWarnings.length > 0
                status: Ui.Status.Warning
                Layout.fillWidth: true
                message: {
                    const places = root.controller.secretWarnings.map(w => w.place + " looks like " + w.looksLike)
                    return "This document may hold secrets: " + places.join("; ") + ". Anyone you share it with "
                        + "can read them. This check is best-effort, so look over the document before you share it."
                }
            }
            Ui.Banner {
                objectName: "share-message"
                visible: root.controller.message !== ""
                status: Ui.Status.Error
                message: root.controller.message
                retryable: true
                Layout.fillWidth: true
                onRetryRequested: root.controller.refresh()
            }
            Ui.BusyIndicator { visible: root.controller.loading; running: root.controller.loading; Layout.alignment: Qt.AlignHCenter }

            LinkSection { title: "Viewer link"; linkRole: "viewer"; link: root.controller.viewerLink }
            ColumnLayout {
                visible: root.controller.viewerLink.exists
                Layout.fillWidth: true
                spacing: Ui.Metrics.xs
                Ui.Toggle {
                    objectName: "share-viewer-history"
                    text: "Viewers can read the history"
                    checked: root.controller.viewerLink.history
                    enabled: !root.controller.busy
                    onCheckedChangedByUser: c => root.controller.setViewerOptions(c, root.controller.viewerLink.download, root.controller.viewerLink.duplicate)
                }
                Ui.Toggle {
                    objectName: "share-viewer-download"
                    text: "Viewers can download the files"
                    checked: root.controller.viewerLink.download
                    enabled: !root.controller.busy
                    onCheckedChangedByUser: c => root.controller.setViewerOptions(root.controller.viewerLink.history, c, root.controller.viewerLink.duplicate)
                }
                Ui.Toggle {
                    objectName: "share-viewer-duplicate"
                    text: "Viewers can make their own copy"
                    checked: root.controller.viewerLink.duplicate
                    enabled: !root.controller.busy
                    onCheckedChangedByUser: c => root.controller.setViewerOptions(root.controller.viewerLink.history, root.controller.viewerLink.download, c)
                }
            }
            LinkSection { title: "Editor link"; linkRole: "editor"; link: root.controller.editorLink }

            ColumnLayout {
                visible: root.controller.people.length > 0
                Layout.fillWidth: true
                spacing: Ui.Metrics.xs
                Ui.PanelHeader { text: "People with access"; Layout.fillWidth: true }
                ListView {
                    objectName: "share-people"
                    Layout.fillWidth: true
                    Layout.preferredHeight: contentHeight
                    interactive: false
                    model: root.controller.people
                    spacing: Ui.Metrics.xs
                    delegate: RowLayout {
                        id: person
                        required property var modelData
                        width: ListView.view.width
                        spacing: Ui.Metrics.sm
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.micro
                            Ui.Text {
                                text: person.modelData.name || person.modelData.email || person.modelData.userId
                                role: Ui.Typography.SansLabel
                                elide: Text.ElideRight
                                Layout.fillWidth: true
                            }
                            // Where the access comes from and what it allows (P6).
                            Ui.Text {
                                objectName: "share-person-access"
                                readonly property var allowed: [
                                    person.modelData.history ? "read the history" : "",
                                    person.modelData.download ? "download the files" : "",
                                    person.modelData.duplicate ? "make a copy" : ""].filter(x => x !== "")
                                text: [person.modelData.sources,
                                       person.modelData.role === "viewer" && allowed.length > 0 ? "Can " + allowed.join(", ") : ""]
                                      .filter(x => x).join(". ")
                                visible: text !== ""
                                role: Ui.Typography.SansCaption
                                tone: Ui.Text.Secondary
                                wrapMode: Text.Wrap
                                Layout.fillWidth: true
                            }
                        }
                        Ui.Select {
                            accessibleName: "Role of " + (person.modelData.name || person.modelData.userId)
                            options: [{label: "Viewer", value: "viewer"}, {label: "Editor", value: "editor"}]
                            value: person.modelData.role
                            enabled: !root.controller.busy
                            onValueCommitted: v => root.controller.setPersonRole(person.modelData.userId, v)
                        }
                        Ui.EditorButton {
                            text: "Remove"
                            variant: Ui.EditorButton.Destructive
                            enabled: !root.controller.busy
                            onClicked: root.controller.removePerson(person.modelData.userId)
                        }
                    }
                }
            }

            ColumnLayout {
                visible: root.controller.disabledLinks.length > 0
                Layout.fillWidth: true
                spacing: Ui.Metrics.xs
                Ui.PanelHeader { text: "Disabled links"; Layout.fillWidth: true }
                Ui.Text {
                    text: "Nobody new can join through these links. The people who joined keep their access, and these settings still apply to them. Remove a person to end their access."
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    wrapMode: Text.Wrap
                    Layout.fillWidth: true
                }
                Repeater {
                    model: root.controller.disabledLinks
                    delegate: ColumnLayout {
                        id: disabled
                        required property var modelData
                        objectName: "share-disabled-" + modelData.shareId
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.micro
                        Ui.Text {
                            text: (disabled.modelData.role === "editor" ? "Editor link, " : "Viewer link, ")
                                  + (disabled.modelData.people === 1 ? "1 person" : disabled.modelData.people + " people")
                            role: Ui.Typography.SansLabel
                            Layout.fillWidth: true
                        }
                        Ui.Toggle {
                            visible: disabled.modelData.role === "viewer"
                            text: "They can read the history"
                            checked: disabled.modelData.history
                            enabled: !root.controller.busy
                            onCheckedChangedByUser: c => root.controller.setLinkOptions(disabled.modelData.shareId, c, disabled.modelData.download, disabled.modelData.duplicate)
                        }
                        Ui.Toggle {
                            visible: disabled.modelData.role === "viewer"
                            text: "They can download the files"
                            checked: disabled.modelData.download
                            enabled: !root.controller.busy
                            onCheckedChangedByUser: c => root.controller.setLinkOptions(disabled.modelData.shareId, disabled.modelData.history, c, disabled.modelData.duplicate)
                        }
                        Ui.Toggle {
                            visible: disabled.modelData.role === "viewer"
                            text: "They can make their own copy"
                            checked: disabled.modelData.duplicate
                            enabled: !root.controller.busy
                            onCheckedChangedByUser: c => root.controller.setLinkOptions(disabled.modelData.shareId, disabled.modelData.history, disabled.modelData.download, c)
                        }
                    }
                }
            }

            ColumnLayout {
                visible: root.controller.linkedDocuments.length > 0
                Layout.fillWidth: true
                spacing: Ui.Metrics.xs
                Ui.PanelHeader { text: "Linked documents"; Layout.fillWidth: true }
                Ui.Text {
                    text: "A link to this document does not open the documents it links to. Each needs a link of its own."
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    wrapMode: Text.Wrap
                    Layout.fillWidth: true
                }
                ListView {
                    objectName: "share-linked"
                    Layout.fillWidth: true
                    Layout.preferredHeight: contentHeight
                    interactive: false
                    model: root.controller.linkedDocuments
                    spacing: Ui.Metrics.xs
                    delegate: RowLayout {
                        id: linked
                        required property var modelData
                        width: ListView.view.width
                        spacing: Ui.Metrics.sm
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.micro
                            Ui.Text { text: linked.modelData.label; role: Ui.Typography.SansLabel; elide: Text.ElideRight; Layout.fillWidth: true }
                            Ui.Text {
                                text: linked.modelData.state === "shared"
                                      ? (linked.modelData.editorUrl
                                         ? "Has its own link. Its editor link lets anyone who has it change the document."
                                         : "Has its own link. Send it along.")
                                    : linked.modelData.state === "notShared" ? "Not shared. People who join cannot open it."
                                    : linked.modelData.state === "unavailable" ? "You cannot share it from this account. People who join cannot open it."
                                    : "Checking…"
                                role: Ui.Typography.SansCaption
                                tone: linked.modelData.state === "shared" ? Ui.Text.Secondary : Ui.Text.Warning
                                wrapMode: Text.Wrap
                                Layout.fillWidth: true
                            }
                        }
                        // Each role has its own action, so an editor link is
                        // never copied in place of a viewer link.
                        Ui.EditorButton {
                            objectName: "share-linked-copy-viewer"
                            visible: linked.modelData.state === "shared" && !!linked.modelData.viewerUrl
                            text: "Copy viewer link"
                            onClicked: root.copy(linked.modelData.viewerUrl, "Viewer link copied.")
                        }
                        Ui.EditorButton {
                            objectName: "share-linked-copy-editor"
                            visible: linked.modelData.state === "shared" && !!linked.modelData.editorUrl
                            text: "Copy editor link"
                            onClicked: root.copy(linked.modelData.editorUrl,
                                                 "Editor link copied. Anyone who has it can change the document.")
                        }
                        Ui.EditorButton {
                            objectName: "share-linked-add-viewer"
                            visible: (linked.modelData.state === "notShared"
                                      || (linked.modelData.state === "shared" && !linked.modelData.viewerUrl))
                            text: linked.modelData.state === "shared" ? "Add viewer link" : "Share as viewer"
                            enabled: !root.controller.busy
                            onClicked: root.controller.shareLinked(linked.modelData.kind, linked.modelData.documentId, "viewer")
                        }
                        Ui.EditorButton {
                            objectName: "share-linked-add-editor"
                            visible: linked.modelData.state === "notShared"
                            text: "Share as editor"
                            enabled: !root.controller.busy
                            onClicked: root.controller.shareLinked(linked.modelData.kind, linked.modelData.documentId, "editor")
                        }
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true
                Ui.Text { id: copied; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; Layout.fillWidth: true }
                Ui.EditorButton { objectName: "share-close"; text: "Close"; onClicked: root.closeRequested() }
            }
        }
    }
}
