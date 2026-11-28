// New music project (docs/MUSIC-MODE.md section 15, UI-1, MD9): tempo as a
// whole number from 30 to 300 BPM, one of 2/4, 3/4, 4/4 and 6/8, and an
// optional key. The host creates the sequence from `settings()` when the
// person confirms, and reports a server error through `error`. The project
// is the open one by default, another project of `projects`, or a new project
// folder. The server writes the timeline file into that project's folder.
import QtQuick
import QtQuick.Dialogs
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    objectName: "newMusicProjectDialog"
    property Item returnFocusTo: null
    property bool busy: false
    property string error: ""
    readonly property bool opened: dialog.visible
    property string signature: "4/4"
    property string keyTonic: ""
    property string keyMode: "major"
    // The rows of projects.list ({id, name, folder: {path}}) and the open project.
    property var projects: []
    property string currentProjectId: ""
    // A project id, or newProjectValue for a new project folder. Empty while
    // the projects are not loaded: the host's selected project then applies.
    property string projectChoice: ""
    readonly property string newProjectValue: "new-project-folder"
    readonly property bool creatingProject: projectChoice === newProjectValue
    readonly property var projectOptions: (projects || []).map(row => ({label: row.name || qsTr("Untitled project"), value: row.id}))
        .concat([{label: qsTr("New project folder…"), value: newProjectValue}])
    readonly property var chosenProject: (projects || []).find(row => row.id === projectChoice) || null
    readonly property string destination: {
        const file = "Timelines/Untitled music.timeline.json"
        if (creatingProject) {
            const place = projectLocationField.text.trim()
            return place !== "" ? qsTr("Saved in a new folder for the project in %1, as %2").arg(place).arg(file)
                                : qsTr("Saved in a new folder for the project in the projects folder, as %1").arg(file)
        }
        const path = chosenProject && chosenProject.folder ? chosenProject.folder.path || "" : ""
        return path !== "" ? qsTr("Saved as %1").arg(path + "/" + file)
                           : qsTr("Saved in the project, as %1").arg(file)
    }
    readonly property string refusal: {
        const rule = MusicProjectRules.refusal(settings())
        if (rule !== "") return rule
        if (creatingProject && projectNameField.text.trim() === "") return qsTr("Enter a name for the new project.")
        return ""
    }
    signal createRequested(var settings)
    signal cancelled()

    function settings() {
        const chosen = MusicProjectRules.signatures.find(entry => entry.value === signature) || {beatsPerBar: 4, beatUnit: 4}
        const bpm = bpmField.text.trim() === "" ? NaN : Number(bpmField.text)
        const values = {bpm: bpm, beatsPerBar: chosen.beatsPerBar, beatUnit: chosen.beatUnit, keyTonic: keyTonic, keyMode: keyMode}
        if (creatingProject) {
            values.newProjectName = projectNameField.text.trim()
            const place = projectLocationField.text.trim()
            if (place !== "") values.newProjectLocation = place
        } else if (projectChoice !== "") {
            values.projectId = projectChoice
        }
        return values
    }
    function resetProject() {
        const ids = (projects || []).map(row => row.id)
        projectChoice = ids.indexOf(currentProjectId) >= 0 ? currentProjectId : (ids.length ? ids[0] : "")
    }
    onProjectsChanged: if (projectChoice === "" || (!creatingProject && !chosenProject)) resetProject()
    onCurrentProjectIdChanged: if (!dialog.visible) resetProject()
    function open() {
        error = ""
        resetProject()
        projectNameField.text = ""
        projectLocationField.text = ""
        bpmField.value = 120
        bpmField.text = "120"
        signature = "4/4"
        keyTonic = ""
        keyMode = "major"
        dialog.open()
    }
    function close() { dialog.close() }

    ProjectSettingsDialog.TimelineListDialog {
        id: dialog
        objectName: "newMusicProjectPopup"
        returnFocusTo: root.returnFocusTo
        title: qsTr("New music project")
        confirmText: qsTr("Create")
        confirmEnabled: root.refusal === ""
        busy: root.busy
        onConfirmed: root.createRequested(root.settings())
        onCancelled: { root.close(); root.cancelled() }
        content: Column {
            width: parent.width
            spacing: Ui.Metrics.lg
            Column {
                width: parent.width
                spacing: Ui.Metrics.xs
                Ui.Text { text: qsTr("Project"); role: Ui.Typography.SansLabel }
                Ui.Select {
                    objectName: "musicProject"
                    width: parent.width
                    density: Ui.EditorButton.Comfortable
                    accessibleName: qsTr("Project")
                    options: root.projectOptions
                    value: root.projectChoice
                    onValueCommitted: value => root.projectChoice = value
                }
            }
            Column {
                width: parent.width
                spacing: Ui.Metrics.lg
                visible: root.creatingProject
                Column {
                    width: parent.width
                    spacing: Ui.Metrics.xs
                    Ui.Text { text: qsTr("Project name"); role: Ui.Typography.SansLabel }
                    Ui.TextField {
                        id: projectNameField
                        objectName: "musicNewProjectName"
                        width: parent.width
                        density: Ui.EditorButton.Comfortable
                        accessibleName: qsTr("Project name")
                        placeholderText: qsTr("My song")
                    }
                }
                Column {
                    width: parent.width
                    spacing: Ui.Metrics.xs
                    Ui.Text { text: qsTr("Location"); role: Ui.Typography.SansLabel }
                    Row {
                        width: parent.width
                        spacing: Ui.Metrics.sm
                        Ui.TextField {
                            id: projectLocationField
                            objectName: "musicNewProjectLocation"
                            width: parent.width - chooseLocation.width - parent.spacing
                            density: Ui.EditorButton.Comfortable
                            accessibleName: qsTr("Location of the project folder")
                            placeholderText: qsTr("Projects folder")
                        }
                        Ui.EditorButton {
                            id: chooseLocation
                            objectName: "musicChooseLocation"
                            density: Ui.EditorButton.Comfortable
                            text: qsTr("Choose…")
                            accessibleName: qsTr("Choose the location")
                            onClicked: locationDialog.open()
                        }
                    }
                }
            }
            Ui.Text {
                objectName: "musicProjectDestination"
                width: parent.width
                text: root.destination
                wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            Ui.Separator { width: parent.width }
            Ui.Text {
                width: parent.width
                text: qsTr("Bars and the key apply to every generated take. The tempo cannot change once the project holds audio.")
                wrapMode: Text.WordWrap
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            Row {
                width: parent.width
                spacing: Ui.Metrics.lg
                Column {
                    width: (parent.width - parent.spacing) / 2
                    spacing: Ui.Metrics.xs
                    Ui.Text { text: qsTr("Tempo (BPM)"); role: Ui.Typography.SansLabel }
                    Ui.NumberField {
                        id: bpmField
                        objectName: "musicBpmField"
                        width: parent.width
                        density: Ui.EditorButton.Comfortable
                        from: 30
                        to: 300
                        value: 120
                        accessibleName: qsTr("Tempo in BPM")
                        errorText: qsTr("A whole number from 30 to 300")
                        valid: root.refusal === ""
                        inputMethodHints: Qt.ImhDigitsOnly
                        selectByMouse: true
                        onValueCommitted: value => bpmField.value = value
                    }
                }
                Column {
                    width: (parent.width - parent.spacing) / 2
                    spacing: Ui.Metrics.xs
                    Ui.Text { text: qsTr("Time signature"); role: Ui.Typography.SansLabel }
                    Ui.Select {
                        objectName: "musicSignature"
                        width: parent.width
                        density: Ui.EditorButton.Comfortable
                        accessibleName: qsTr("Time signature")
                        options: MusicProjectRules.signatures
                        value: root.signature
                        onValueCommitted: value => root.signature = value
                    }
                }
            }
            Row {
                width: parent.width
                spacing: Ui.Metrics.lg
                Column {
                    width: (parent.width - parent.spacing) / 2
                    spacing: Ui.Metrics.xs
                    Ui.Text { text: qsTr("Key"); role: Ui.Typography.SansLabel }
                    Ui.Select {
                        objectName: "musicKeyTonic"
                        width: parent.width
                        density: Ui.EditorButton.Comfortable
                        accessibleName: qsTr("Key")
                        options: MusicProjectRules.keyTonics
                        value: root.keyTonic
                        onValueCommitted: value => root.keyTonic = value
                    }
                }
                Column {
                    width: (parent.width - parent.spacing) / 2
                    spacing: Ui.Metrics.xs
                    Ui.Text { text: qsTr("Mode"); role: Ui.Typography.SansLabel }
                    Ui.Select {
                        objectName: "musicKeyMode"
                        width: parent.width
                        density: Ui.EditorButton.Comfortable
                        accessibleName: qsTr("Key mode")
                        enabled: root.keyTonic !== ""
                        options: MusicProjectRules.keyModes
                        value: root.keyMode
                        onValueCommitted: value => root.keyMode = value
                    }
                }
            }
            Ui.Text {
                objectName: "musicProjectRefusal"
                width: parent.width
                visible: text !== ""
                text: root.refusal !== "" ? root.refusal : root.error
                wrapMode: Text.WordWrap
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Error
            }
            Ui.Text {
                width: parent.width
                text: qsTr("The project starts with four audio tracks: Drums, Bass, Keyboard and Guitar.")
                wrapMode: Text.WordWrap
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
        }
    }
    FolderDialog {
        id: locationDialog
        title: qsTr("Choose where the project folder goes")
        onAccepted: {
            const url = selectedFolder.toString()
            projectLocationField.text = url.startsWith("file://") ? decodeURIComponent(url.slice(7)) : url
        }
    }
}
