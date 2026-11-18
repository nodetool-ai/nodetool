pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.NodeEditor

// Lists, creates and deletes worker profiles
// (web/src/components/workers/WorkerProfilesDialog.tsx). A profile is a saved
// template: provider, image, machine and lifecycle limits. "Create and start"
// rents the first worker in the same step.
Ui.Dialog {
    id: root
    required property WorkerFleet fleet
    objectName: "workers-profiles-dialog"
    title: fleet.profiles.length === 0 ? "Set up a worker" : "Manage worker profiles"

    readonly property string defaultImage: "ghcr.io/nodetool-ai/nodetool-worker:latest"
    readonly property string comfyImage: "ghcr.io/nodetool-ai/nodetool-worker-comfy:latest"
    readonly property string custom: "__custom__"
    // GPU ids are provider-native: RunPod wants the gpuTypeId, Vast its gpu_name.
    readonly property var gpuOptions: ({
        runpod: [
            {value: "", label: "CPU only (no GPU)"},
            {value: "NVIDIA RTX A5000", label: "RTX A5000 · 24 GB"},
            {value: "NVIDIA GeForce RTX 4090", label: "RTX 4090 · 24 GB"},
            {value: "NVIDIA L4", label: "L4 · 24 GB"},
            {value: "NVIDIA RTX A6000", label: "RTX A6000 · 48 GB"},
            {value: "NVIDIA A40", label: "A40 · 48 GB"},
            {value: "NVIDIA L40S", label: "L40S · 48 GB"},
            {value: "NVIDIA A100 80GB PCIe", label: "A100 · 80 GB"},
            {value: "NVIDIA H100 80GB HBM3", label: "H100 · 80 GB"},
            {value: "__custom__", label: "Other (enter GPU id)…"}],
        vast: [
            {value: "", label: "Any (cheapest offer)"},
            {value: "RTX_3090", label: "RTX 3090 · 24 GB"},
            {value: "RTX_4090", label: "RTX 4090 · 24 GB"},
            {value: "RTX_A6000", label: "RTX A6000 · 48 GB"},
            {value: "A40", label: "A40 · 48 GB"},
            {value: "L40S", label: "L40S · 48 GB"},
            {value: "A100_PCIE", label: "A100 · 80 GB"},
            {value: "A100_SXM4", label: "A100 SXM4 · 80 GB"},
            {value: "H100_PCIE", label: "H100 · 80 GB"},
            {value: "__custom__", label: "Other (enter GPU id)…"}],
        verda: [{value: "__custom__", label: "Enter instance type…"}]
    })
    readonly property var defaultGpu: ({runpod: "NVIDIA A40", vast: "", verda: "__custom__"})

    property string target: "runpod"
    property string gpu: defaultGpu.runpod
    property string imageChoice: defaultImage
    property bool busy: false
    property string formError: ""
    readonly property bool cpuMachine: target === "runpod" && gpu === ""
    readonly property string resolvedGpu: gpu === custom ? customGpu.text.trim() : gpu
    readonly property string image: imageChoice === custom ? imageField.text.trim() : imageChoice
    readonly property bool apiKeyMissing: fleet.apiKeyStatus[target] === false
    readonly property string machineLabel: {
        if (cpuMachine) { return "CPU" }
        if (gpu === custom) { return customGpu.text.trim() || "GPU" }
        const option = gpuOptions[target].find(candidate => candidate.value === gpu)
        return option && option.value !== "" ? option.label.split(" · ")[0] : "GPU"
    }
    readonly property string suggestedName: fleet.suggestProfileName(root.fleet.providerLabel(target) + " " + machineLabel)
    readonly property bool canCreate: image !== "" && (gpu !== custom || resolvedGpu !== "") && !busy

    function resetForm() {
        target = "runpod"
        gpu = defaultGpu.runpod
        imageChoice = defaultImage
        nameField.text = ""
        customGpu.text = ""
        imageField.text = defaultImage
        disk.text = "100"
        idle.text = "30"
        lifetime.text = ""
        tokenPolicy.value = "generate"
        vcpu.value = "4"
    }
    function create(start) {
        if (!canCreate) { return }
        busy = true
        formError = ""
        fleet.createProfile({
            name: nameField.text.trim() || suggestedName, target: target, image: image, gpu: resolvedGpu,
            vcpu: vcpu.value, disk: disk.text, token_policy: tokenPolicy.value,
            idle_timeout_minutes: idle.text, max_lifetime_minutes: lifetime.text
        }, start)
    }
    onOpened: formError = ""
    Connections {
        target: root.fleet
        function onProfileFinished(error, started) {
            root.busy = false
            root.formError = error
            if (error === "") {
                root.resetForm()
                if (started) { root.close() }
            }
        }
    }

    contentItem: ColumnLayout {
        spacing: Ui.Metrics.md
        Basic.ScrollView {
            id: scroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredHeight: form.implicitHeight
            contentWidth: availableWidth
            clip: true
            ColumnLayout {
                id: form
                width: scroll.availableWidth
                spacing: Ui.Metrics.sm
                Ui.Status {
                    objectName: "workers-profiles-error"
                    visible: root.formError !== ""
                    Layout.fillWidth: true
                    status: Ui.Status.Error
                    message: root.formError
                    wrap: true
                }
                Ui.Text {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    text: "A profile is a saved template. Provisioning it rents one GPU box and connects this app to it."
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Ui.Text { visible: root.fleet.profiles.length > 0; text: "Existing profiles"; role: Ui.Typography.SansLabel }
                Repeater {
                    model: root.fleet.profiles
                    delegate: RowLayout {
                        id: existing
                        required property var modelData
                        Layout.fillWidth: true
                        Ui.Text { Layout.fillWidth: true; text: existing.modelData.name; elide: Text.ElideRight }
                        Ui.Text { text: root.fleet.providerLabel(existing.modelData.target); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                        Ui.EditorButton {
                            objectName: "workers-profile-delete-" + existing.modelData.name
                            text: "Delete"
                            accessibleName: "Delete profile " + existing.modelData.name
                            variant: Ui.EditorButton.Flat
                            density: Ui.EditorButton.Compact
                            enabled: !root.busy
                            onClicked: root.fleet.deleteProfile(existing.modelData.name)
                        }
                    }
                }
                Ui.Text { text: "Create a profile"; role: Ui.Typography.SansLabel }
                Ui.Text { text: "Provider"; role: Ui.Typography.SansCaption }
                Ui.Select {
                    objectName: "workers-profile-provider"
                    Layout.fillWidth: true
                    accessibleName: "Provider"
                    options: [{value: "runpod", label: "RunPod"}, {value: "vast", label: "Vast"}, {value: "verda", label: "Verda"}]
                    value: root.target
                    // GPU ids differ per provider, so a new provider resets the pick.
                    onValueCommitted: value => {
                        root.target = value
                        root.gpu = root.defaultGpu[value]
                        customGpu.text = ""
                    }
                }
                WorkerApiKeyCard { Layout.fillWidth: true; visible: root.apiKeyMissing; fleet: root.fleet; target: root.target }
                Ui.Text { text: "GPU"; role: Ui.Typography.SansCaption }
                Ui.Select {
                    objectName: "workers-profile-gpu"
                    Layout.fillWidth: true
                    accessibleName: "GPU"
                    options: root.gpuOptions[root.target]
                    value: root.gpu
                    onValueCommitted: value => root.gpu = value
                }
                Ui.TextField {
                    id: customGpu
                    objectName: "workers-profile-gpu-id"
                    visible: root.gpu === root.custom
                    Layout.fillWidth: true
                    accessibleName: root.target === "vast" ? "GPU id (Vast gpu_name)" : root.target === "verda" ? "Instance type" : "GPU id (RunPod gpuTypeId)"
                    placeholderText: accessibleName
                }
                Ui.Text { visible: root.cpuMachine; text: "vCPU"; role: Ui.Typography.SansCaption }
                Ui.Select {
                    id: vcpu
                    visible: root.cpuMachine
                    Layout.fillWidth: true
                    accessibleName: "vCPU"
                    value: "4"
                    options: ["2", "4", "8", "16", "32"].map(count => ({value: count, label: count + " vCPU"}))
                    onValueCommitted: value => vcpu.value = value
                }
                Ui.Text { text: "Disk (GB)"; role: Ui.Typography.SansCaption }
                Ui.TextField { id: disk; objectName: "workers-profile-disk"; Layout.fillWidth: true; text: "100"; accessibleName: "Disk (GB)"; inputMethodHints: Qt.ImhDigitsOnly }
                Ui.Text { text: "Idle timeout (minutes)"; role: Ui.Typography.SansCaption }
                Ui.TextField { id: idle; objectName: "workers-profile-idle"; Layout.fillWidth: true; text: "30"; accessibleName: "Idle timeout (minutes)"; placeholderText: "Blank = never"; inputMethodHints: Qt.ImhDigitsOnly }
                Ui.Text { text: "Name"; role: Ui.Typography.SansCaption }
                Ui.TextField { id: nameField; objectName: "workers-profile-name"; Layout.fillWidth: true; accessibleName: "Name"; placeholderText: root.suggestedName }
                Ui.Text { text: "Worker image preset"; role: Ui.Typography.SansCaption }
                Ui.Select {
                    Layout.fillWidth: true
                    accessibleName: "Worker image preset"
                    options: [{value: root.defaultImage, label: "NodeTool Worker"}, {value: root.comfyImage, label: "NodeTool Worker + ComfyUI"}, {value: root.custom, label: "Custom…"}]
                    value: root.imageChoice
                    onValueCommitted: value => root.imageChoice = value
                }
                Ui.TextField {
                    id: imageField
                    visible: root.imageChoice === root.custom
                    Layout.fillWidth: true
                    text: root.defaultImage
                    accessibleName: "Worker image"
                }
                Ui.Text { text: "Token policy"; role: Ui.Typography.SansCaption }
                Ui.Select {
                    id: tokenPolicy
                    Layout.fillWidth: true
                    accessibleName: "Token policy"
                    value: "generate"
                    options: [{value: "generate", label: "Generate (recommended)"}, {value: "fixed", label: "Fixed"}]
                    onValueCommitted: value => tokenPolicy.value = value
                }
                Ui.Text { text: "Max lifetime (minutes)"; role: Ui.Typography.SansCaption }
                Ui.TextField { id: lifetime; Layout.fillWidth: true; accessibleName: "Max lifetime (minutes)"; placeholderText: "Blank = no cap"; inputMethodHints: Qt.ImhDigitsOnly }
            }
        }
        RowLayout {
            Layout.alignment: Qt.AlignRight
            Ui.EditorButton { text: "Close"; onClicked: root.close() }
            Ui.EditorButton {
                objectName: "workers-profile-create"
                text: "Create profile"
                variant: Ui.EditorButton.Outlined
                enabled: root.canCreate
                onClicked: root.create(false)
            }
            Ui.EditorButton {
                objectName: "workers-profile-create-start"
                text: "Create and start"
                variant: Ui.EditorButton.Primary
                loading: root.busy
                enabled: root.canCreate && !root.apiKeyMissing
                onClicked: root.create(true)
            }
        }
    }
}
