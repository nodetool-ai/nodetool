pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
InspectorSection {
    id: root
    required property ClipInspectorController controller
    property string newRole: "in"
    property string newPreset: "fade"
    readonly property var roleOptions: [{value:"in",label:"In"},{value:"out",label:"Out"},{value:"emphasis",label:"Emphasis"},{value:"loop",label:"Loop"}]
    readonly property var animations: controller.clip.animations || []
    property var editorIds: []
    property string editorIdsKey: ""
    onGroupedChanged: {
        const ids = grouped.map(a => a.id)
        const key = JSON.stringify(ids)
        if (key !== editorIdsKey) { editorIdsKey = key; editorIds = ids }
    }
    readonly property var grouped: roleOptions.reduce((list,role) => list.concat(animations.filter(a => a.role === role.value)),[])
    readonly property real inOutSpan: {
        const longest = role => animations.filter(a => a.role === role && a.enabled !== false).reduce((max,a) => Math.max(max,a.durationMs+(a.delayMs || 0)),0)
        return longest("in")+longest("out")
    }
    title: "Animate"
    defaultOpen: false
    function options(role) {
        return MotionAnimationCatalog.presets.filter(p => p.roles.indexOf(role) >= 0).map(p => ({value:p.id,label:MotionAnimationCatalog.labels.presets[p.id] || p.id})).concat([{value:"custom",label:"Custom (keyframes)"}])
    }
    function freshCustom() { return {curves:[{property:"opacity",keyframes:[{t:0,value:0},{t:1,value:1}]}]} }
    function presetPatch(id) {
        if (id === "custom") return {preset:"custom",params:undefined,custom:freshCustom()}
        const preset = MotionAnimationCatalog.presets.find(p => p.id === id)
        if (!preset) return {}
        const params = {}
        preset.params.forEach(p => params[p.name] = p.default)
        return {preset:id,durationMs:preset.defaultDurationMs,easing:preset.defaultEasing,params:preset.params.length ? params : undefined,custom:undefined}
    }
    function patch(id,values,phase) {
        const next = animations.map(a => a.id === id ? Object.assign({},a,values) : a)
        const payload = {action:"animations",animations:JSON.parse(JSON.stringify(next))}
        if (phase === "preview") controller.preview(payload)
        else if (phase === "commit") controller.commit(payload)
        else controller.write(payload)
    }
    function remove(id) { controller.write({action:"animations",animations:animations.filter(a => a.id !== id)}) }
    RowLayout {
        width: parent.width
        spacing: Ui.Metrics.md
        InspectorSelect {
            Layout.fillWidth: true
            label: "New animation role"
            value: root.newRole
            options: root.roleOptions
            disabled: root.controller.locked
            onChange: next => { root.newRole = next; root.newPreset = root.options(next)[0].value }
        }
        InspectorSelect {
            Layout.fillWidth: true
            label: "New animation preset"
            value: root.newPreset
            options: root.options(root.newRole)
            disabled: root.controller.locked
            onChange: next => root.newPreset = next
        }
        Ui.EditorButton {
            text: "+ Add"
            enabled: !root.controller.locked
            onClicked: {
                const next = Object.assign({id:root.controller.newAnimationId(),role:root.newRole,durationMs:800,enabled:true},root.presetPatch(root.newPreset))
                root.controller.write({action:"animations",animations:JSON.parse(JSON.stringify(root.animations.concat([next])))})
            }
        }
    }
    Ui.Text {
        width: parent.width
        visible: root.inOutSpan > (root.controller.clip.durationMs || 0)
        text: "In and out together run " + root.inOutSpan + "ms, past the clip's " + root.controller.clip.durationMs + "ms. They overlap in the middle."
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Warning
        wrapMode: Text.WordWrap
    }
    Ui.Text { width: parent.width; visible: root.animations.length === 0; text: "Add an entrance, exit, emphasis, or loop preset."; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary; wrapMode: Text.WordWrap }
    Repeater {
        model: root.editorIds
        KeyframeClipAnimationEditor {
            required property string modelData
            width: parent.width
            animation: root.animations.find(a => a.id === modelData) || {role:"in",preset:"custom",durationMs:800}
            controller: root.controller
            options: root.options(animation.role)
            onPatch: (values,phase) => root.patch(animation.id,values,phase)
            onPresetChange: next => root.patch(animation.id,root.presetPatch(next),"")
            onRemove: root.remove(animation.id)
        }
    }
}
