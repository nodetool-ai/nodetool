import QtQuick
import NodeTool.UiPrimitives as Ui
import NodeTool.NodeEditor
Rectangle {
    id: fixture
    width: 1000; height: 1200
    color: roles.chrome
    property string scheme: "dark"
    required property NodeCatalog nodeCatalog
    required property PackSetup packSetup
    onSchemeChanged: Ui.Theme.preference = scheme === "light" ? Ui.Theme.Light : Ui.Theme.Dark
    Component.onCompleted: {
        Ui.Theme.uiScale = 1
        Ui.Theme.textScale = 1
        Ui.Theme.reducedMotion = true
        Ui.Theme.preference = scheme === "light" ? Ui.Theme.Light : Ui.Theme.Dark
    }
    Toolbar { visible: false }
    EditorRoles { id: roles }
    NodeButton { objectName: "button-default"; x: 20; y: 20; text: "Run" }
    NodeButton { objectName: "button-primary"; x: 150; y: 20; text: "Run"; variant: NodeButton.Primary }
    NodeButton { objectName: "button-disabled"; x: 280; y: 20; text: "Run"; enabled: false }
    Ui.Text { objectName: "text-label"; x: 20; y: 160; text: "Prompt"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
    Ui.Text { objectName: "text-caption"; x: 280; y: 160; text: "Sample text"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
    ViewportIndicator { objectName: "surface-panel"; x: 540; y: 160 }
    Catalog { objectName: "catalog"; x: 20; y: 300; width: 280; height: 350; catalog: fixture.nodeCatalog; packSetup: fixture.packSetup }
    QtObject {
        id: propertyFixture
        property string selection: "metadata-fixture"
        property bool readOnly: false
        property string message: ""
        property var properties: [
            {name: "field-default", label: "Field", kind: "text", value: "Sample text", editable: true, hasValue: true},
            {name: "field-focus", label: "Focused field", kind: "text", value: "Sample text", editable: true, hasValue: true},
            {name: "field-disabled", label: "Disabled field", kind: "text", value: "Sample text", editable: false, hasValue: true},
            {name: "Prompt", label: "Prompt", description: "Describe the image to generate.", kind: "text", value: "A quiet mountain lake", editable: true, hasValue: true},
            {name: "seed", label: "Seed", kind: "integer", value: 42, min: 0, max: 1000, step: 1, editable: true, hasValue: true},
            {name: "enabled", label: "Enabled", kind: "boolean", value: true, editable: true, hasValue: true},
            {name: "quality", label: "Quality", kind: "choice", value: 2, options: [{label: "Standard", value: 1}, {label: "High", value: 2}], editable: true, hasValue: true},
            {name: "input", label: "Input image", kind: "unsupported", value: {uri: "asset://fixture"}, editable: false, connected: true, hasValue: true}
        ]
        function commitProperty(nodeId, name, value) {}
        function removeProperty(nodeId, name) {}
    }
    Inspector { propertyHost: propertyFixture; objectName: "inspector"; x: 350; y: 300; width: 280; height: 880 }
}
