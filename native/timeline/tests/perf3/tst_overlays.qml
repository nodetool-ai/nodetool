import QtQuick
import QtTest
import NodeTool.Timeline
import "../../qml/Inspector" as Inspector
import "../../qml/effectcontrols" as Effects

TestCase {
    id: test
    name: "Perf3Overlays"
    width: 1920
    height: 1080
    when: windowShown
    property int paints: 0
    Component {
        id: focusComponent
        Inspector.ReframeFocusOverlay {
            frameWidth: 1920
            frameHeight: 1080
            sourceWidth: 1920
            sourceHeight: 1080
            sequenceWidth: 1920
            sequenceHeight: 1080
        }
    }
    Component {
        id: planComponent
        MusicPanelModel { timeline: testTimeline; selection: testGestures.musicSelection }
    }
    function descendants(item, name) {
        let count = item.objectName.indexOf(name) === 0 ? 1 : 0
        for (const child of item.children || []) { count += descendants(child, name) }
        return count
    }
    function cleanup() { testHarness.reset(); SourceViewerState.asset = ({}) }
    function test_takeMenuClosesWhenTargetDisappears() {
        testHarness.loadPerf3Takes(10)
        const plan = createTemporaryObject(planComponent, test)
        const component = Qt.createComponent(Qt.resolvedUrl("../../qml/music/MusicTakeList.qml"))
        verify(component.status === Component.Ready, component.errorString())
        const list = createTemporaryObject(component, test, {width:500,plan:plan})
        verify(list)
        list.openAgain(list, "1")
        verify(findChild(list, "musicTakeRegenerateMenu"))
        verify(plan.deleteTake("1"))
        tryCompare(list, "menuTakeId", "")
        tryVerify(() => findChild(list, "musicTakeRegenerateMenu") === null)
    }
    function test_takeFixtureResetRestoresDocument() {
        const before = testHarness.documentJson()
        testHarness.loadPerf3Takes(10)
        testHarness.reset()
        compare(testHarness.documentJson(), before)
    }
    function test_takesAreVirtualized() {
        testHarness.loadPerf3Takes(1000)
        const plan = createTemporaryObject(planComponent, test)
        verify(plan)
        compare(plan.takes.length, 1000)
        const component = Qt.createComponent(Qt.resolvedUrl("../../qml/music/MusicTakeList.qml"))
        verify(component.status === Component.Ready, component.errorString())
        const list = createTemporaryObject(component, test, {width:500,plan:plan})
        verify(list)
        wait(50)
        const count = descendants(list, "musicTake_")
        console.log("take cards instantiated:", count, "of", plan.takes.length)
        verify(count > 0 && count < 20)
        compare(findChild(list, "musicTakeRegenerateMenu"), null)
        list.openAgain(list, "0")
        const menu = findChild(list, "musicTakeRegenerateMenu")
        verify(menu)
        list.openAgain(list, "1")
        compare(findChild(list, "musicTakeRegenerateMenu"), menu)
    }
    QtObject {
        id: graphController
        property int revision: 0
        function rowGraph() { return {curves:[], velocity:[], vmax:0} }
        function rowGraphKeys() {
            return {lo:0,hi:500,keys:Array.from({length:500}, (_,i)=>({ms:i*2,values:[i],handles:{x1:0.3,y1:0.3,x2:0.7,y2:0.7}}))}
        }
    }
    QtObject {
        id: graphPanel
        property QtObject controller: graphController
        property real scrollMs: 0
        property real visibleMs: 1000
        property real laneWidth: 800
        property real laneX: 200
        property real listWidth: 200
        property int selectedCount: 0
        property bool handleDragging: false
        property var selectedKeys: ({})
        function xOf(ms) { return ms * 0.8 }
        function isSelected() { return false }
    }
    Component {
        id: graphComponent
        Effects.EffectControlsGraph { width:1000; panel:graphPanel; rowId:"position"; inputs:[] }
    }
    function test_denseGraphDoesNotCreateHiddenHandles() {
        const graph = createTemporaryObject(graphComponent, test)
        verify(graph)
        wait(20)
        const count = descendants(graph, "effectControlsHandle_")
        console.log("dense graph handle items:", count)
        compare(count, 0)
    }
    function test_hiddenSourcePosterDoesNotDecode() {
        const component = Qt.createComponent(Qt.resolvedUrl("../../qml/SourceViewerPanel.qml"))
        verify(component.status === Component.Ready, component.errorString())
        const panel = createTemporaryObject(component, test, {width:960,height:640,visible:false})
        verify(panel)
        SourceViewerState.asset = {id:"still",content_type:"image/png",thumb_url:"file:///private/tmp/perf3-hidden-poster.png"}
        const poster = findChild(panel, "sourcePoster")
        verify(poster)
        verify(!poster.visible)
        compare(poster.source.toString(), "")
    }
    function test_sourceDecodeIsBoundedBeforeMediaOpens() {
        const component = Qt.createComponent(Qt.resolvedUrl("../../qml/SourceViewerPanel.qml"))
        verify(component.status === Component.Ready, component.errorString())
        const panel = createTemporaryObject(component, test, {width:960,height:640})
        verify(panel)
        const poster = findChild(panel, "sourcePoster")
        verify(poster)
        verify(poster.sourceSize.width > 0 && poster.sourceSize.height > 0)
        compare(poster.sourceSize.width % 128, 0)
        compare(poster.sourceSize.height % 128, 0)
        verify(poster.sourceSize.width * poster.sourceSize.height < 2000000)
    }
    function test_focusBackingAreaIsHandleSized() {
        const overlay = createTemporaryObject(focusComponent, test)
        verify(overlay)
        const handle = findChild(overlay, "reframeFocusHandle") || findChild(overlay, "reframeHandleCanvas")
        verify(handle)
        console.log("focus backing area:", handle.width * handle.height)
        verify(handle.width * handle.height < 10000, "Focus handle must not allocate the preview-sized backing surface")
    }
    function test_loopDragDoesNotPaintWaveform() {
        const component = Qt.createComponent(Qt.resolvedUrl("../../qml/instruments/SamplerPanel.qml"))
        verify(component.status === Component.Ready, component.errorString())
        const sampler = createTemporaryObject(component, test, {width:600,height:500,instrument:({zones:[{id:"zone",loopMode:"sustain",loopStart:0.1,loopEnd:0.9}]})})
        verify(sampler)
        sampler.waveformPeaks = Array.from({length:160}, () => 0.5)
        const box = findChild(sampler, "samplerWaveformDropTarget")
        verify(box)
        let canvas = null
        for (const child of box.children) {
            if (child.requestPaint !== undefined) { canvas = child; break }
        }
        verify(canvas)
        wait(50)
        const countPaint = function() { ++test.paints }
        canvas.paint.connect(countPaint)
        test.paints = 0
        for (let i = 0; i < 40; ++i) {
            box.draftLoopStart = 0.1 + i * 0.01
            wait(5)
        }
        canvas.paint.disconnect(countPaint)
        console.log("loop drag waveform paints:", test.paints)
        compare(test.paints, 0)
    }
}
