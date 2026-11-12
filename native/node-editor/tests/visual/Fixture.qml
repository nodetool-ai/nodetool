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
    // Fixture fields with no run footer, filled by Capture.cpp.
    required property NodeInspector inspectorFixture
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
    Inspector { inspector: fixture.inspectorFixture; objectName: "inspector"; x: 350; y: 300; width: 280; height: 880 }
}
