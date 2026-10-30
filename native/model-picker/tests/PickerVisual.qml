import QtQuick
import QtQuick.Controls.Basic
import NodeTool.ModelPicker

ApplicationWindow {
    id: window
    visible: true
    width: 800
    height: 620
    color: "#08090A"
    QtObject {
        id: fixture
        objectName: "pickerFixture"
        property string mode: "chat"
        property string modelScope: "local"
        property string search: ""
        property string group: "All"
        property var providers: ["openai", "anthropic"]
        property var cloudProviders: ["openai", "anthropic"]
        property var localProviders: []
        property var models: [{id: "gpt-5", provider: "openai"}, {id: "claude", provider: "anthropic"}, {id: "unavailable", provider: "openai"}]
        property bool loading: false
        property bool loaded: true
        property bool needsProviderSetup: false
        property string error: ""
        property string selectedModelId: ""
        property string selectedProvider: ""
        property bool reorderOnRefresh: false
        property var selectedModel: ({})
        property var results: ListModel {
            ListElement { modelId: "gpt-5"; provider: "openai"; name: "GPT-5"; detail: "OpenAI · gpt-5"; executionLabel: "API"; favorite: false; isDefault: false; current: false; available: true }
            ListElement { modelId: "unavailable"; provider: "openai"; name: "Unavailable model"; detail: "OpenAI · unavailable"; executionLabel: "unavailable"; favorite: false; isDefault: false; current: false; available: false }
            ListElement { modelId: "claude"; provider: "anthropic"; name: "Claude"; detail: "Anthropic · claude"; executionLabel: "API"; favorite: false; isDefault: false; current: false; available: true }
        }
        function providerLabel(id) { return id === "openai" ? "OpenAI" : id === "anthropic" ? "Anthropic" : id }
        function reload() {
            if (!reorderOnRefresh) return
            reorderOnRefresh = false
            const rows = []
            for (let index = 0; index < results.count; ++index) {
                const row = results.get(index)
                rows.push({modelId: row.modelId, provider: row.provider, name: row.name, detail: row.detail,
                           executionLabel: row.executionLabel, favorite: row.favorite, isDefault: row.isDefault,
                           current: row.current, available: row.available})
            }
            results.clear()
            results.append(rows[2])
            results.append(rows[0])
            results.append(rows[1])
        }
        function hasAvailable(id, provider) { return true }
        function resultAt(index) {
            if (index < 0 || index >= results.count) return null
            const row = results.get(index)
            return {id: row.modelId, provider: row.provider, available: row.available}
        }
        function selectModel(id, provider) { selectedModelId = id; selectedProvider = provider; selectedModel = {id: id, provider: provider, name: id} }
        function toggleFavorite(id, provider) { results.setProperty(id === "gpt-5" ? 0 : 1, "favorite", true) }
        function setDefault(id, provider) { results.setProperty(id === "gpt-5" ? 0 : 1, "isDefault", true) }
    }
    Button {
        id: trigger
        objectName: "visualTrigger"
        x: 24; y: 24
        text: "Choose model"
        onClicked: picker.openAt(trigger)
    }
    ModelPicker {
        id: picker
        catalog: fixture
    }
    Component.onCompleted: Qt.callLater(() => picker.openAt(trigger))
}
