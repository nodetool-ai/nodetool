pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
Rectangle {
 id: root
 implicitWidth: Ui.Metrics.dialogCompactWidth * 2
 implicitHeight: Ui.Metrics.touch * 10
 signal closeRequested()
 required property var controller
 color: Ui.Theme.surfacePanel
 RowLayout {
  anchors.fill: parent
  anchors.margins: Ui.Metrics.lg
  spacing: Ui.Metrics.lg
  ColumnLayout {
   Layout.preferredWidth: Ui.Metrics.dialogCompactWidth
   Layout.fillHeight: true
   RowLayout {
    Ui.EditorButton { text: "Close"; onClicked: root.closeRequested() }
    Ui.Text { text: "Version history"; role: Ui.Typography.SansTitle }
    Ui.EditorButton { text: "Refresh"; enabled: root.controller.available && !root.controller.busy; onClicked: root.controller.load("versions") }
   }
   Ui.Text { visible: !root.controller.available; text: "Save this local workflow to a server first."; role: Ui.Typography.SansBody }
   Ui.Text { visible: root.controller.busy; text: "Loading…"; role: Ui.Typography.SansCaption }
   Ui.Text { visible: !root.controller.busy && !root.controller.rows.length; text: "No workflow versions."; role: Ui.Typography.SansBody }
   Basic.ScrollView {
    Layout.fillWidth: true; Layout.fillHeight: true; contentWidth: availableWidth; clip: true
    ColumnLayout {
     width: parent.width
     Repeater {
      model: root.controller.rows
      ColumnLayout {
       id: entry
       required property var modelData
       required property int index
       Layout.fillWidth: true
       RowLayout {
        Layout.fillWidth: true
        VersionGraphPreview { graph: entry.modelData.graph || {}; Layout.preferredWidth: Ui.Metrics.touch * 2; Layout.preferredHeight: Ui.Metrics.touch }
        Ui.EditorButton {
         objectName: "version-row-" + entry.index
         Layout.fillWidth: true
         contentAlignment: Qt.AlignLeft
         text: "v" + entry.modelData.version + " · " + (entry.modelData.save_type || (/manual|checkpoint|restore/i.exec(entry.modelData.name || "") || ["autosave"])[0])
         active: root.controller.selectedIndex === entry.index
         enabled: !root.controller.busy
         onClicked: root.controller.inspect(entry.index)
        }
        Ui.EditorButton { objectName: "version-compare-" + entry.index; text: "Compare"; active: root.controller.compareIndex === entry.index; enabled: root.controller.selectedIndex >= 0 && !root.controller.busy; onClicked: root.controller.compareWith(entry.index) }
       }
       RowLayout {
        visible: root.controller.selectedIndex === entry.index
        Ui.EditorButton { text: "Restore"; enabled: !root.controller.busy; loading: root.controller.busy; onClicked: root.controller.restore(confirmation.checked) }
        Ui.EditorButton { text: "Delete"; enabled: !root.controller.busy; onClicked: deleteConfirmation.open() }
       }
       Ui.Text { text: (entry.modelData.created_at || "Time unavailable") + " · " + (entry.modelData.size_bytes / 1024).toFixed(1) + " KB"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
       Ui.Text { visible: text !== ""; text: entry.modelData.description || entry.modelData.name || ""; role: Ui.Typography.SansCaption; elide: Text.ElideRight; Layout.fillWidth: true }
      }
     }
    }
   }
  }
  Basic.ScrollView {
   Layout.fillWidth: true; Layout.fillHeight: true; contentWidth: availableWidth; clip: true
   ColumnLayout {
    width: parent.width
    spacing: Ui.Metrics.md
    Ui.Text { text: root.controller.selectedIndex < 0 ? "Select a version" : "Inspected version"; role: Ui.Typography.SansLabel }
    VersionGraphPreview { objectName: "version-graph-preview"; graph: root.controller.selectedGraph; Layout.fillWidth: true; Layout.preferredHeight: Ui.Metrics.touch * 3 }
    Ui.Text { objectName: "versions-error"; text: root.controller.error; visible: text !== ""; role: Ui.Typography.SansBody; Layout.fillWidth: true; wrapMode: Text.Wrap }
    RowLayout {
     Ui.CheckBox { id: confirmation; objectName: "restore-confirm"; text: "Replace unsaved work" }
     Ui.EditorButton { objectName: "restore-version"; text: "Restore"; loading: root.controller.busy; enabled: root.controller.selectedIndex >= 0 && root.controller.available && !root.controller.busy; onClicked: root.controller.restore(confirmation.checked) }
     Ui.EditorButton { objectName: "delete-selected-version"; text: "Delete"; enabled: root.controller.selectedIndex >= 0 && !root.controller.busy; onClicked: deleteConfirmation.open() }
    }
    Ui.Text { objectName: "version-diff-heading"; text: root.controller.compareIndex < 0 ? "Current document → inspected version" : "v" + root.controller.rows[root.controller.compareIndex].version + " → inspected version"; role: Ui.Typography.SansLabel }
    Ui.EditorButton { visible: root.controller.compareIndex >= 0; text: "Compare with current document"; onClicked: root.controller.compareWith(-1) }
    Ui.Text { visible: !root.controller.comparison.hasChanges; text: "No changes detected"; role: Ui.Typography.SansCaption }
    Repeater {
     model: ["addedNodes", "removedNodes", "modifiedNodes", "addedEdges", "removedEdges", "modifiedEdges"]
     ColumnLayout {
      id: section
      required property string modelData
      Layout.fillWidth: true
      visible: (root.controller.comparison[modelData] || []).length > 0
      Ui.Text { tone: section.modelData.startsWith("added") ? Ui.Text.Success : section.modelData.startsWith("removed") ? Ui.Text.Error : Ui.Text.Warning; text: ({addedNodes: "Added nodes", removedNodes: "Removed nodes", modifiedNodes: "Changed nodes", addedEdges: "Added connections", removedEdges: "Removed connections", modifiedEdges: "Changed connections"})[section.modelData] + " (" + (root.controller.comparison[section.modelData] || []).length + ")"; role: Ui.Typography.SansLabel }
      Repeater {
       model: root.controller.comparison[section.modelData] || []
       ColumnLayout {
        id: change
        required property var modelData
        Layout.fillWidth: true
        Ui.Text { text: change.modelData.type || change.modelData.id || (change.modelData.source + " → " + change.modelData.target); role: Ui.Typography.SansCaption; Layout.fillWidth: true; wrapMode: Text.WrapAnywhere }
        Repeater {
         model: change.modelData.changes || []
         Ui.Text { required property var modelData; text: modelData.key + ": " + JSON.stringify(modelData.oldValue) + " → " + JSON.stringify(modelData.newValue); role: Ui.Typography.MonoCaption; Layout.fillWidth: true; wrapMode: Text.WrapAnywhere }
        }
       }
      }
     }
    }
   }
  }
 }
 Ui.Dialog {
  id: deleteConfirmation
  title: "Delete inspected version?"
  width: Math.min(Ui.Metrics.dialogCompactWidth, root.width)
  modal: true
  returnFocusTo: root
  contentItem: RowLayout {
   Ui.EditorButton { objectName: "cancel-delete-version"; text: "Cancel"; onClicked: deleteConfirmation.close() }
   Ui.EditorButton { objectName: "confirm-delete-version"; text: "Delete version"; variant: Ui.EditorButton.Destructive; onClicked: { root.controller.deleteSelected(); deleteConfirmation.close() } }
  }
 }
}
