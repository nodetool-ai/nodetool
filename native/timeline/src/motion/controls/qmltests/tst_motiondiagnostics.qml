import QtQuick
import QtTest
import NodeTool.Timeline
Item {
    id: host
    width: 900; height: 800
    ClipInspectorController { id: controller; timeline: testTimeline; clock: testClock; clipId: "c" }
    InspectorEdits { id: edits; model: testTimeline }
    TestCase {
        name: "MotionDiagnostics"
        when: windowShown
        function test_staggerWarning() {
            testHarness.reset()
            edits.apply("patchClip", {clipId:"c", patch:{mediaType:"text", textStyle:{text:"one two three",fontSizePx:40}}})
            const component = Qt.createComponent("../../../../qml/Inspector/KeyframeClipAnimationEditor.qml")
            compare(component.status, Component.Ready, component.errorString())
            const editor = createTemporaryObject(component, host, {controller:controller, width:800,
                animation:{id:"a", role:"in",preset:"fade",durationMs:1500,stagger:{unit:"word",offsetMs:400}}})
            verify(editor)
            const warning = findChild(editor, "staggerOverrunWarning")
            verify(warning); verify(warning.visible)
            verify(warning.text.indexOf("2300ms") >= 0)
            editor.animation = {id:"a",role:"in",preset:"fade",durationMs:500,stagger:{unit:"word",offsetMs:100}}
            tryCompare(warning, "visible", false)

        }
        function test_staleFullClipStagger() {
            testHarness.reset()
            edits.apply("patchClip", {clipId:"c",patch:{mediaType:"text",textStyle:{text:"one two three",fontSizePx:40}}})
            const component = Qt.createComponent("../../../../qml/Inspector/KeyframeClipAnimationEditor.qml")
            const editor = createTemporaryObject(component,host,{controller:controller,width:800,
                animation:{id:"a",role:"in",preset:"kenBurns",durationMs:1500,stagger:{unit:"word",offsetMs:400}}})
            verify(editor); const warning = findChild(editor,"staggerOverrunWarning"); verify(warning); verify(!warning.visible)
        }
        function test_staleNonTextStagger() {
            testHarness.reset()
            const component = Qt.createComponent("../../../../qml/Inspector/KeyframeClipAnimationEditor.qml")
            const editor = createTemporaryObject(component,host,{controller:controller,width:800,
                animation:{id:"a",role:"in",preset:"fade",durationMs:2500,stagger:{unit:"word",offsetMs:400}}})
            verify(editor); const warning = findChild(editor,"staggerOverrunWarning"); verify(warning); verify(!warning.visible)
        }
        function test_packagedDiagnostics() {
            testHarness.reset()
            edits.apply("patchClip", {clipId:"c", patch:{mediaType:"text",textStyle:{text:"one two three",fontSizePx:40}}})
            const animationComponent = Qt.createComponent("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/KeyframeClipAnimationEditor.qml")
            compare(animationComponent.status, Component.Ready, animationComponent.errorString())
            const animationEditor = createTemporaryObject(animationComponent,host,{controller:controller,width:800,
                animation:{id:"a",role:"in",preset:"fade",durationMs:1500,stagger:{unit:"word",offsetMs:400}}})
            verify(animationEditor)
            const stagger = findChild(animationEditor,"staggerOverrunWarning")
            verify(stagger); verify(stagger.visible)
            const curveComponent = Qt.createComponent("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/KeyframeClipCustomCurves.qml")
            compare(curveComponent.status, Component.Ready, curveComponent.errorString())
            const curve = {property:"opacity",keyframes:[{t:0,value:0},{t:1,value:1}]}
            const curveEditor = createTemporaryObject(curveComponent,host,{controller:controller,width:800,custom:{curves:[curve,curve]}})
            verify(curveEditor)
            const warning = findChild(curveEditor,"customCurveWarning")
            verify(warning); verify(warning.visible)
        }
        function test_curveWarning() {
            const component = Qt.createComponent("../../../../qml/Inspector/KeyframeClipCustomCurves.qml")
            compare(component.status, Component.Ready, component.errorString())
            const curve = {property:"opacity",keyframes:[{t:0,value:0},{t:1,value:1}]}
            const editor = createTemporaryObject(component, host, {controller:controller,width:800,custom:{curves:[curve,curve]}})
            verify(editor)
            compare(editor.curveError({curves:[], timeBase:"future"}), "")
            compare(editor.curveError({curves:false}), "curves must be an array")
            compare(editor.curveError({curves:[null]}), "curves[0] is not an object")
            compare(editor.curveError({curves:[{property:"opacity",keyframes:[{t:0,value:1,easing:"future"}]}]}), "")
            compare(editor.curveError({curves:[{property:"opacity",keyframes:[{t:-4,value:1},{t:4,value:2}]}]}), "")
            compare(editor.curveError({timeBase:"source",curves:[{property:"opacity",keyframes:[{sourceMs:10,value:1},{sourceMs:5,value:2}]}]}),
                    "curves[0] (opacity) keyframe 1 goes back in the source (5ms after 10ms) — keyframes must ascend")
            const warning = findChild(editor,"customCurveWarning")
            verify(warning); verify(warning.visible)
            compare(warning.text, 'These curves will not play: two curves drive "opacity" — one curve per property.')
            editor.custom = {curves:[curve]}
            tryCompare(warning,"visible",false)
            editor.sourceAnchored = true
            editor.custom = {timeBase:"source", curves:[{property:"opacity",keyframes:[{sourceMs:100,value:0},{sourceMs:50,value:1}]}]}
            tryCompare(warning,"visible",true)
            verify(warning.text.indexOf("goes back in the source") >= 0)
            editor.custom = {timeBase:"source", curves:[{property:"opacity",keyframes:[{sourceMs:100,value:0},{sourceMs:200,value:1}]}]}
            tryCompare(warning,"visible",false)
        }
    }
}
