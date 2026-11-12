// First use of music generation (docs/MUSIC-MODE.md section 12.4 and section 15,
// BE-5): shown in place of the Generate button while the server lacks the music
// engine or its models. It names what is missing and why an install is blocked,
// offers Install and Download models with the download size, shows progress
// with Cancel, and offers the base model on the first Add instrument.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Column {
    id: root
    objectName: "musicSetup"
    // The editor's MusicSetupModel.
    property var setup: null
    // The panel's operation: "lego" asks for the base model as well.
    property string operation: ""
    readonly property var running: setup && setup.busy ? setup.operation : null
    readonly property bool needsBase: !!setup && setup.state === "ready" && operation === "lego" && !setup.addInstrumentReady
    spacing: Ui.Metrics.sm

    Ui.Text {
        width: parent.width
        text: root.needsBase ? qsTr("Add instrument needs the base model") : qsTr("Set up music generation")
        role: Ui.Typography.SansLabel
    }

    // The engine.
    Row {
        objectName: "musicSetupEngine"
        visible: !root.needsBase
        width: parent.width
        spacing: Ui.Metrics.sm
        Column {
            width: parent.width - installButton.width - parent.spacing
            anchors.verticalCenter: parent.verticalCenter
            Ui.Text {
                width: parent.width
                text: root.setup && root.setup.binaryInstalled ? qsTr("Music engine installed") : qsTr("Music engine not installed")
                role: Ui.Typography.SansCaption
            }
            Ui.Text {
                objectName: "musicSetupBlocked"
                visible: text !== ""
                width: parent.width
                text: root.setup ? root.setup.blockedReason : ""
                wrapMode: Text.WordWrap
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Warning
            }
        }
        Ui.EditorButton {
            id: installButton
            objectName: "musicSetupInstall"
            visible: !!root.setup && !root.setup.binaryInstalled
            anchors.verticalCenter: parent.verticalCenter
            density: Ui.EditorButton.Compact
            text: qsTr("Install")
            enabled: !!root.setup && root.setup.blockedReason === "" && !root.setup.busy
            disabledReason: root.setup && root.setup.blockedReason !== "" ? root.setup.blockedReason
                : qsTr("Wait for the current step to finish.")
            onClicked: root.setup.install()
        }
    }

    // The models: the first-run set, or the base model for Add instrument.
    Row {
        objectName: "musicSetupModels"
        width: parent.width
        spacing: Ui.Metrics.sm
        Ui.Text {
            width: parent.width - downloadButton.width - parent.spacing
            anchors.verticalCenter: parent.verticalCenter
            text: !root.setup ? ""
                : root.needsBase ? qsTr("Base model: %1 to download").arg(root.setup.formatBytes(root.setup.addInstrumentMissingBytes))
                : root.setup.firstRunModelsPresent ? qsTr("Models downloaded")
                : qsTr("Models: %1 to download").arg(root.setup.formatBytes(root.setup.firstRunMissingBytes))
            wrapMode: Text.WordWrap
            role: Ui.Typography.SansCaption
        }
        Ui.EditorButton {
            id: downloadButton
            objectName: "musicSetupDownload"
            visible: !!root.setup && (root.needsBase || !root.setup.firstRunModelsPresent)
            anchors.verticalCenter: parent.verticalCenter
            density: Ui.EditorButton.Compact
            text: qsTr("Download models")
            enabled: !!root.setup && root.setup.modelsAvailable && !root.setup.busy
            disabledReason: root.setup && !root.setup.modelsAvailable ? qsTr("This server has no folder for models.")
                : qsTr("Wait for the current step to finish.")
            onClicked: root.setup.downloadModels(root.needsBase ? "add_instrument" : "first_run")
        }
    }

    // Progress of the running step.
    Column {
        objectName: "musicSetupProgress"
        visible: root.running !== null
        width: parent.width
        spacing: Ui.Metrics.xs
        Ui.Text {
            objectName: "musicSetupStage"
            width: parent.width
            text: root.running ? root.running.stage : ""
            elide: Text.ElideMiddle
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
        Row {
            width: parent.width
            spacing: Ui.Metrics.sm
            Ui.Progress {
                width: parent.width - cancelButton.width - parent.spacing
                anchors.verticalCenter: parent.verticalCenter
                from: 0
                to: 100
                indeterminate: !root.running || root.running.percent < 0
                value: root.running && root.running.percent >= 0 ? root.running.percent : 0
                accessibleName: qsTr("Setup progress")
            }
            Ui.EditorButton {
                id: cancelButton
                objectName: "musicSetupCancel"
                density: Ui.EditorButton.Compact
                text: qsTr("Cancel")
                onClicked: root.setup.cancel()
            }
        }
    }

    Ui.Status {
        objectName: "musicSetupMessage"
        visible: message !== ""
        width: parent.width
        wrap: true
        status: Ui.Status.Error
        message: !root.setup ? ""
            : root.setup.message !== "" ? root.setup.message
            : root.setup.operation.state === "failed" ? (root.setup.operation.error || qsTr("The last setup step failed."))
            : ""
    }
}
