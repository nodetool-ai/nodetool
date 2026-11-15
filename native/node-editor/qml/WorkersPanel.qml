pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.NodeEditor

// The status bar's Workers view (web/src/components/workers/WorkersPanel.tsx):
// the GPU workers the server rents. It lists each instance with its status,
// uptime and cost, starts a worker from a profile or a ComfyUI preset, and
// keeps Stop, Terminate and Stop all one click away, because pods bill
// continuously.
Rectangle {
    id: root
    required property WorkerFleet fleet
    signal closeRequested()
    implicitWidth: Ui.Metrics.dialogCompactWidth * 2
    implicitHeight: Ui.Metrics.touch * 8
    color: Ui.Theme.surfacePanel
    readonly property var instances: fleet.instances
    readonly property bool hasProfiles: fleet.profiles.length > 0
    Component.onCompleted: fleet.setActive(true)
    Component.onDestruction: fleet.setActive(false)

    function statusTone(tone) {
        return tone === "success" ? Ui.Text.Success : tone === "error" ? Ui.Text.Error
             : tone === "running" ? Ui.Text.Info : Ui.Text.Secondary
    }
    // With no profile yet, Start worker opens the setup form instead of an empty picker.
    function openStart() {
        if (hasProfiles) { provisionDialog.open() } else { profilesDialog.open() }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.lg
        spacing: Ui.Metrics.md
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Ui.Text { objectName: "workers-title"; text: "Workers"; role: Ui.Typography.SansLabel }
            Ui.Text {
                objectName: "workers-rate"
                visible: text !== ""
                text: root.fleet.rateText
                role: Ui.Typography.MonoCaption
                tone: Ui.Text.Secondary
            }
            Item { Layout.fillWidth: true }
            Ui.EditorButton {
                objectName: "workers-manage-profiles"
                text: "Manage profiles"
                variant: Ui.EditorButton.Flat
                density: Ui.EditorButton.Compact
                enabled: root.fleet.available
                onClicked: profilesDialog.open()
            }
            Ui.EditorButton {
                objectName: "workers-start"
                text: "Start worker"
                variant: Ui.EditorButton.Outlined
                density: Ui.EditorButton.Compact
                enabled: root.fleet.available
                onClicked: root.openStart()
            }
            Ui.EditorButton {
                objectName: "workers-reconcile"
                text: "Reconcile"
                variant: Ui.EditorButton.Flat
                density: Ui.EditorButton.Compact
                enabled: root.fleet.available && !root.fleet.busy
                onClicked: root.fleet.reconcile()
            }
            Ui.EditorButton {
                objectName: "workers-stop-all"
                text: "Stop all"
                variant: Ui.EditorButton.Flat
                density: Ui.EditorButton.Compact
                enabled: root.instances.length > 0
                onClicked: root.fleet.stopAll()
            }
            Ui.CloseButton {
                objectName: "workers-close"
                accessibleName: "Close workers"
                description: accessibleName
                onClicked: root.closeRequested()
            }
        }
        Ui.Banner {
            objectName: "workers-error"
            visible: root.fleet.error !== ""
            Layout.fillWidth: true
            status: Ui.Status.Error
            message: root.fleet.error
            actionText: "Dismiss"
            onActionTriggered: root.fleet.clearError()
        }
        Ui.Banner {
            objectName: "workers-orphans"
            visible: root.fleet.orphanWarning.title !== undefined
            Layout.fillWidth: true
            status: Ui.Status.Warning
            message: visible ? root.fleet.orphanWarning.title + ". " + root.fleet.orphanWarning.details : ""
            actionText: "Dismiss"
            onActionTriggered: root.fleet.dismissOrphanWarning()
        }
        Basic.ScrollView {
            id: scroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            contentWidth: availableWidth
            clip: true
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            ColumnLayout {
                width: scroll.availableWidth
                spacing: Ui.Metrics.sm
                WorkerApiKeyCard {
                    Layout.fillWidth: true
                    visible: root.fleet.apiKeyStatus.runpod === false && root.fleet.comfyPresets.length > 0
                    fleet: root.fleet
                    target: "runpod"
                }
                Repeater {
                    model: root.fleet.comfyPresets
                    delegate: Ui.Surface {
                        id: preset
                        required property var modelData
                        objectName: "workers-preset-" + modelData.id
                        Layout.fillWidth: true
                        implicitHeight: presetRow.implicitHeight + Ui.Metrics.md * 2
                        RowLayout {
                            id: presetRow
                            anchors.fill: parent
                            anchors.margins: Ui.Metrics.md
                            spacing: Ui.Metrics.lg
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: Ui.Metrics.xs
                                Ui.Text { text: preset.modelData.label; role: Ui.Typography.SansLabel }
                                Ui.Text {
                                    Layout.fillWidth: true
                                    wrapMode: Text.WordWrap
                                    readonly property int hours: Math.round(preset.modelData.maxLifetimeMinutes / 60)
                                    text: "About $" + preset.modelData.hourlyUsd.min.toFixed(2) + "–$" + preset.modelData.hourlyUsd.max.toFixed(2)
                                          + " per hour. Ends after " + hours + (hours === 1 ? " hour" : " hours") + " and deletes its files."
                                    role: Ui.Typography.SansCaption
                                    tone: Ui.Text.Secondary
                                }
                            }
                            Ui.EditorButton {
                                objectName: "workers-preset-start-" + preset.modelData.id
                                variant: Ui.EditorButton.Outlined
                                density: Ui.EditorButton.Compact
                                accessibleName: "Start " + preset.modelData.label + " on a rented GPU"
                                text: root.fleet.startingPresetId === preset.modelData.id ? "Starting…" : "Start"
                                enabled: root.fleet.apiKeyStatus.runpod !== false && root.fleet.startingPresetId === ""
                                         && !root.instances.some(instance => instance.profile_name === preset.modelData.profileName)
                                onClicked: root.fleet.startPreset(preset.modelData.id)
                            }
                        }
                    }
                }
                Ui.BusyIndicator {
                    Layout.alignment: Qt.AlignHCenter
                    visible: root.fleet.loading
                    running: visible
                    accessibleName: "Loading workers"
                }
                Ui.EmptyState {
                    objectName: "workers-empty"
                    Layout.alignment: Qt.AlignHCenter
                    Layout.topMargin: Ui.Metrics.lg
                    visible: !root.fleet.loading && root.instances.length === 0
                    maxTextWidth: Math.min(scroll.availableWidth, Ui.Metrics.dialogCompactWidth)
                    title: !root.fleet.available ? "No server connected"
                         : root.hasProfiles ? "No workers running" : "Run graphs on a rented GPU"
                    message: !root.fleet.available ? "Workers need a NodeTool server. Connect to a server, then open Workers again."
                           : root.hasProfiles ? "Start one to rent a GPU for your graphs."
                           : "Connect RunPod once and pick a GPU. NodeTool then runs your Python nodes on it, and idle workers pause on their own."
                    actionText: !root.fleet.available ? "" : root.hasProfiles ? "Start a worker" : "Set up a worker"
                    onActionTriggered: root.openStart()
                }
                Repeater {
                    model: root.instances
                    delegate: Ui.Surface {
                        id: row
                        required property var modelData
                        readonly property var instance: modelData
                        readonly property bool running: instance.status === "running"
                        readonly property bool stopping: root.fleet.stoppingId === instance.id
                        objectName: "workers-instance-" + instance.id
                        Layout.fillWidth: true
                        implicitHeight: instanceRow.implicitHeight + Ui.Metrics.md * 2
                        RowLayout {
                            id: instanceRow
                            anchors.fill: parent
                            anchors.margins: Ui.Metrics.md
                            spacing: Ui.Metrics.lg
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: Ui.Metrics.xs
                                RowLayout {
                                    spacing: Ui.Metrics.md
                                    Ui.Text { text: row.instance.profile_name; role: Ui.Typography.SansLabel }
                                    // The web StatusIndicator pulses while a pod changes state. A spinner shows that here.
                                    Ui.BusyIndicator {
                                        visible: row.instance.pulse
                                        running: visible
                                        implicitWidth: Ui.Metrics.iconSm
                                        implicitHeight: Ui.Metrics.iconSm
                                        accessibleName: row.instance.statusLabel
                                    }
                                    Ui.Text {
                                        objectName: "workers-status-" + row.instance.id
                                        text: row.instance.statusLabel
                                        role: Ui.Typography.SansCaption
                                        tone: root.statusTone(row.instance.tone)
                                    }
                                }
                                Ui.Text {
                                    objectName: "workers-hint-" + row.instance.id
                                    Layout.fillWidth: true
                                    wrapMode: Text.WordWrap
                                    text: row.instance.hint !== "" ? row.instance.hint : row.instance.id
                                    role: Ui.Typography.SansCaption
                                    tone: Ui.Text.Secondary
                                }
                            }
                            Ui.Text { text: "Uptime: " + row.instance.uptime; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                            Ui.Text { text: "Cost: " + row.instance.cost; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                            // A ComfyUI pod has no worker bridge to attach. Its URL goes in the node.
                            Ui.EditorButton {
                                objectName: "workers-copy-" + row.instance.id
                                visible: row.instance.comfyEndpoint !== "" && row.running && row.instance.healthy
                                text: "Copy ComfyUI URL"
                                variant: Ui.EditorButton.Outlined
                                density: Ui.EditorButton.Compact
                                onClicked: {
                                    clipboard.text = row.instance.comfyEndpoint
                                    clipboard.selectAll()
                                    clipboard.copy()
                                }
                            }
                            Ui.EditorButton {
                                objectName: "workers-primary-" + row.instance.id
                                visible: row.instance.comfyEndpoint === ""
                                variant: Ui.EditorButton.Outlined
                                density: Ui.EditorButton.Compact
                                readonly property string mode: row.instance.status === "attached" ? "detach"
                                                             : row.instance.status === "stopped" ? "resume" : "attach"
                                text: mode === "detach" ? "Detach" : mode === "resume" ? "Resume"
                                    : row.instance.booting ? "Booting…" : "Attach"
                                accessibleName: (mode === "detach" ? "Detach" : mode === "resume" ? "Resume" : "Attach") + " worker " + row.instance.id
                                // Attaching mid-boot fails the handshake, so Attach waits for the probe.
                                enabled: mode === "resume" ? !row.stopping
                                       : mode === "detach" ? !root.fleet.busy
                                       : !root.fleet.busy && row.running && row.instance.healthy
                                onClicked: {
                                    if (mode === "detach") { root.fleet.detach() }
                                    else if (mode === "resume") { root.fleet.resume(row.instance.id) }
                                    else { root.fleet.attach(row.instance.id) }
                                }
                            }
                            // Pause: frees the GPU and keeps the volume.
                            Ui.EditorButton {
                                objectName: "workers-stop-" + row.instance.id
                                visible: row.instance.status !== "stopped"
                                text: "Stop"
                                accessibleName: "Stop worker " + row.instance.id
                                variant: Ui.EditorButton.Flat
                                density: Ui.EditorButton.Compact
                                enabled: !row.stopping
                                onClicked: root.fleet.stop(row.instance.id)
                            }
                            // Destroys the pod and its volume.
                            Ui.EditorButton {
                                objectName: "workers-terminate-" + row.instance.id
                                text: "Terminate"
                                accessibleName: "Terminate worker " + row.instance.id
                                variant: Ui.EditorButton.Flat
                                density: Ui.EditorButton.Compact
                                enabled: !row.stopping
                                onClicked: {
                                    terminateDialog.targetId = row.instance.id
                                    terminateDialog.open()
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    // Copies through a hidden text input: QML has no clipboard type of its own.
    TextInput { id: clipboard; visible: false }

    Ui.Dialog {
        id: provisionDialog
        objectName: "workers-provision-dialog"
        title: "Start a worker"
        width: Math.min(Ui.Metrics.dialogCompactWidth, root.width)
        returnFocusTo: root
        property string selected: ""
        readonly property var profile: {
            const profiles = root.fleet.profiles
            return profiles.find(candidate => candidate.name === selected) ?? profiles[0]
        }
        // Provisioning without the provider key fails at the provider, so ask for it here.
        readonly property bool apiKeyMissing: profile !== undefined && root.fleet.apiKeyStatus[profile.target] === false
        onOpened: selected = root.fleet.profiles.length > 0 ? root.fleet.profiles[0].name : ""
        contentItem: ColumnLayout {
            spacing: Ui.Metrics.md
            Ui.Text { text: "Profile"; role: Ui.Typography.SansLabel }
            Ui.Select {
                objectName: "workers-provision-profile"
                Layout.fillWidth: true
                accessibleName: "Profile"
                options: root.fleet.profiles.map(profile => ({value: profile.name, label: profile.name}))
                value: provisionDialog.profile ? provisionDialog.profile.name : ""
                onValueCommitted: value => provisionDialog.selected = value
            }
            WorkerApiKeyCard {
                Layout.fillWidth: true
                visible: provisionDialog.apiKeyMissing
                fleet: root.fleet
                target: provisionDialog.profile ? provisionDialog.profile.target : "runpod"
            }
            Ui.Text {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                visible: provisionDialog.profile !== undefined
                readonly property int idle: provisionDialog.profile ? (provisionDialog.profile.idle_timeout_minutes ?? 0) : 0
                text: idle > 0 ? "It attaches to NodeTool when it is ready and pauses after " + idle + (idle === 1 ? " idle minute." : " idle minutes.")
                               : "It attaches to NodeTool when it is ready. This profile has no idle timeout, so stop the worker when you are done."
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            RowLayout {
                Layout.alignment: Qt.AlignRight
                Ui.EditorButton { text: "Cancel"; onClicked: provisionDialog.close() }
                Ui.EditorButton {
                    objectName: "workers-provision-confirm"
                    text: "Start"
                    variant: Ui.EditorButton.Primary
                    loading: root.fleet.provisioning
                    enabled: provisionDialog.profile !== undefined && !provisionDialog.apiKeyMissing && !root.fleet.provisioning
                    onClicked: root.fleet.provision(provisionDialog.profile.name)
                }
            }
        }
        Connections {
            target: root.fleet
            function onProvisionFinished(ok) { if (ok) { provisionDialog.close() } }
        }
    }

    WorkerProfilesDialog {
        id: profilesDialog
        fleet: root.fleet
        width: Math.min(Ui.Metrics.dialogWidth, root.width)
        height: Math.min(implicitHeight, root.height)
        returnFocusTo: root
    }

    Ui.Dialog {
        id: terminateDialog
        objectName: "workers-terminate-dialog"
        title: "Terminate worker?"
        width: Math.min(Ui.Metrics.dialogCompactWidth, root.width)
        returnFocusTo: root
        property string targetId: ""
        contentItem: ColumnLayout {
            spacing: Ui.Metrics.md
            Ui.Text {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                text: "Its volume and all cached models are permanently deleted. This stops all billing."
                tone: Ui.Text.Secondary
            }
            RowLayout {
                Layout.alignment: Qt.AlignRight
                Ui.EditorButton { text: "Cancel"; onClicked: terminateDialog.close() }
                Ui.EditorButton {
                    objectName: "workers-terminate-confirm"
                    text: "Terminate"
                    variant: Ui.EditorButton.Destructive
                    onClicked: {
                        root.fleet.terminate(terminateDialog.targetId)
                        terminateDialog.close()
                    }
                }
            }
        }
    }
}
