import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Game 1.0
ApplicationWindow {
 id: root
 width: tokens.windowWidth; height: tokens.windowHeight; minimumWidth: tokens.minimumWidth; minimumHeight: tokens.minimumHeight
 visible: true; title: "NodeTool Game — " + editor.saveState
 color: tokens.background
 QtObject { id: tokens; readonly property color background: "#151719"; readonly property color panel: "#202326"; readonly property color text: "#e5e7eb"; readonly property color accent: "#8bb7f0"; readonly property int windowWidth:1280;readonly property int windowHeight:800;readonly property int minimumWidth:800;readonly property int minimumHeight:560;readonly property int assetHeight:150;readonly property int scriptHeight:180;readonly property int inspectorWidth:330;readonly property int hierarchyMinimum:160;readonly property int viewportMinimum:260;readonly property int inspectorMinimum:220;readonly property int selectionBorder:2;readonly property real dragPixelsPerUnit:50;readonly property real cameraPixelsPerUnit:100;readonly property color transparent:"transparent";readonly property int gap: 8; readonly property int padding: 16; readonly property int panelWidth: 260; readonly property int toolbarHeight: 48; readonly property int diagnosticHeight: 90 }
 palette.window: tokens.background; palette.windowText: tokens.text; palette.base: tokens.panel; palette.text: tokens.text; palette.button: tokens.panel; palette.buttonText: tokens.text; palette.highlight: tokens.accent
 property string transformTool: "translate"
 property real snap: 0.25
 property bool closingConfirmed: false
 onClosing: function(event) { if(editor.dirty && !closingConfirmed) {event.accepted=false;closeDialog.open()} }
 Dialog {id: closeDialog;title:"Keep your draft";modal:true;anchors.centerIn:parent;standardButtons:Dialog.Save|Dialog.Discard|Dialog.Cancel
  Label {text:"Unsaved edits are recovered next time you open this game."}
  onAccepted: {if(editor.save()) {root.closingConfirmed=true;root.close()}}
  onDiscarded: {editor.discardDraft();root.closingConfirmed=true;root.close()}
 }
 Shortcut {sequences:[StandardKey.Save];onActivated:editor.save()}
 Shortcut {sequences:[StandardKey.Undo];onActivated:editor.undo()}
 Shortcut {sequences:[StandardKey.Redo];onActivated:editor.redo()}
 Shortcut {sequence:"Escape";onActivated:editor.cancelDrag()}
 Shortcut {sequence:"W";enabled:!inspector.activeFocus&&!scriptSource.activeFocus&&!pathField.activeFocus;onActivated:root.transformTool="translate"}
 Shortcut {sequence:"E";enabled:!inspector.activeFocus&&!scriptSource.activeFocus&&!pathField.activeFocus;onActivated:root.transformTool="rotate"}
 Shortcut {sequence:"R";enabled:!inspector.activeFocus&&!scriptSource.activeFocus&&!pathField.activeFocus;onActivated:root.transformTool="scale"}
 ColumnLayout {anchors.fill:parent;spacing:tokens.gap
  Flow {Layout.fillWidth:true;Layout.preferredHeight:childrenRect.height+tokens.gap;spacing:tokens.gap;Layout.leftMargin:tokens.padding;Layout.rightMargin:tokens.padding
   TextField {id:pathField;objectName:"documentPath";placeholderText:"Game document path";text:editor.path;Layout.fillWidth:true;Accessible.name:"Game document path"}
   Button {text:"Open";onClicked:editor.open(pathField.text)}
   Button {text:"Save";objectName:"saveButton";onClicked:editor.save(pathField.text)}
   Button {text:"Undo";objectName:"undoButton";onClicked:editor.undo()}
   Button {text:"Redo";objectName:"redoButton";onClicked:editor.redo()}
   Button {text:editor.playing?"Stop":"Play";objectName:"playButton";onClicked:editor.playing?editor.stop():editor.start()}
   Button {text:"Step";enabled:editor.playing;onClicked:editor.step()}
   Label {text:editor.saveState+" · revision "+editor.revision}
  }
  SplitView {Layout.fillWidth:true;Layout.fillHeight:true
   ColumnLayout {SplitView.preferredWidth:tokens.panelWidth;SplitView.minimumWidth:tokens.hierarchyMinimum
    Label {text:"Scene hierarchy";Layout.leftMargin:tokens.padding}
    ListView {id:hierarchy;objectName:"hierarchy";Layout.fillWidth:true;Layout.fillHeight:true;clip:true;model:editor.entities
     delegate:ItemDelegate {required property var modelData;objectName:"entity-"+modelData.id;width:ListView.view.width;text:(modelData.parentId?"    ":"")+modelData.name;highlighted:editor.selectedId===modelData.id;onClicked:editor.selectedId=modelData.id;Accessible.name:"Select "+modelData.name}
    }
    Label {text:"Assets";Layout.leftMargin:tokens.padding}
    ListView {Layout.fillWidth:true;Layout.preferredHeight:tokens.assetHeight;clip:true;model:editor.assets
     delegate:ItemDelegate {required property var modelData;width:ListView.view.width;text:modelData.kind+" · "+modelData.id;ToolTip.text:modelData.path;ToolTip.visible:hovered}
    }
   }
   ColumnLayout {SplitView.fillWidth:true;SplitView.minimumWidth:tokens.viewportMinimum
    RowLayout {Layout.fillWidth:true
     ComboBox {id:toolBox;model:["translate","rotate","scale"];onCurrentTextChanged:root.transformTool=currentText;Accessible.name:"Transform tool"}
     Label {text:"Snap"}
     SpinBox {from:0;to:100;value:25;onValueModified:root.snap=value/100;Accessible.name:"Transform snap"}
     Button {text:"Apply selected play transform";enabled:editor.playing&&editor.selectedId.length>0;onClicked:editor.applySimulation()}
    }
    Item {Layout.fillWidth:true;Layout.fillHeight:true;clip:true
     GameViewport {id:viewport;objectName:"editorViewport";anchors.fill:parent;Component.onCompleted:editor.attachViewport(viewport)}
     Rectangle {anchors.fill:parent;color:tokens.transparent;border.width:editor.selectedId.length>0?tokens.selectionBorder:0;border.color:tokens.accent}
     MouseArea {id:gesture;anchors.fill:parent;acceptedButtons:Qt.LeftButton|Qt.RightButton;focus:true;property real startX;property real startY;property bool editing:false
      onPressed:function(mouse) {startX=mouse.x;startY=mouse.y;if(mouse.button===Qt.LeftButton&&editor.selectedId.length>0) {editing=editor.beginDrag(root.transformTool)}}
      onPositionChanged:function(mouse) {if(editing) {let dx=(mouse.x-startX)/tokens.dragPixelsPerUnit;let dy=(startY-mouse.y)/tokens.dragPixelsPerUnit;editor.previewDrag(dx,dy,0,root.snap)}else if(pressedButtons&Qt.RightButton) {editor.navigateCamera((startX-mouse.x)/tokens.cameraPixelsPerUnit,editor.is2D?(mouse.y-startY)/tokens.cameraPixelsPerUnit:0,editor.is2D?0:(startY-mouse.y)/tokens.cameraPixelsPerUnit);startX=mouse.x;startY=mouse.y}}
      onReleased: {if(editing) {editor.endDrag();editing=false}}
      onCanceled: {editor.cancelDrag();editing=false}
      Keys.onEscapePressed: {editor.cancelDrag();editing=false}
      Keys.onPressed:function(event) {const map={};map[Qt.Key_Space]="jump";map[Qt.Key_Left]="left";map[Qt.Key_Right]="right";map[Qt.Key_Up]="forward";map[Qt.Key_Down]="backward";if(editor.playing&&map[event.key]) {editor.setAction(map[event.key],true)}else {event.accepted=false}}
      Keys.onReleased:function(event) {const map={};map[Qt.Key_Space]="jump";map[Qt.Key_Left]="left";map[Qt.Key_Right]="right";map[Qt.Key_Up]="forward";map[Qt.Key_Down]="backward";if(editor.playing&&map[event.key]) {editor.setAction(map[event.key],false)}else {event.accepted=false}}
     }
     Label {anchors.left:parent.left;anchors.bottom:parent.bottom;text:editor.selectedId.length?"Selected: "+editor.selectedId+" · drag to "+root.transformTool:"Select an entity in the hierarchy";color:tokens.text}
    }
   }
   ColumnLayout {SplitView.preferredWidth:tokens.inspectorWidth;SplitView.minimumWidth:tokens.inspectorMinimum
    Label {text:(editor.is2D?"2D inspector":"3D inspector")+" · entity JSON";Layout.leftMargin:tokens.padding}
    ScrollView {Layout.fillWidth:true;Layout.fillHeight:true
     TextArea {id:inspector;objectName:"entityInspector";text:{editor.revision;editor.selectedId;return editor.selectedJson()}
wrapMode:TextEdit.NoWrap;selectByMouse:true;Accessible.name:"Selected entity properties"}
    }
    Button {text:editor.playing?"Apply and restart play":"Apply properties";enabled:editor.selectedId.length>0;onClicked:editor.editEntity(inspector.text)}
    Label {text:"Gameplay script";Layout.leftMargin:tokens.padding}
    ComboBox {id:scripts;Layout.fillWidth:true;model:editor.scripts;textRole:"id";Accessible.name:"Gameplay script"}
    ScrollView {Layout.fillWidth:true;Layout.preferredHeight:tokens.scriptHeight;TextArea {id:scriptSource;objectName:"scriptSource";text:{editor.revision;return editor.source(scripts.currentText)}
wrapMode:TextEdit.NoWrap;selectByMouse:true;Accessible.name:"QuickJS source"}}
    Button {text:editor.playing?"Compile and restart play":"Compile and apply";enabled:scripts.currentText.length>0;onClicked:editor.editScript(scripts.currentText,scriptSource.text)}
   }
  }
  ScrollView {Layout.fillWidth:true;Layout.preferredHeight:tokens.diagnosticHeight
   TextArea {readOnly:true;text:editor.diagnostic.length?editor.diagnostic:"Ready. Changes during play restart simulation unless they affect presentation only.";wrapMode:TextEdit.Wrap;color:tokens.text;Accessible.name:"Diagnostics"}
  }
 }
}
