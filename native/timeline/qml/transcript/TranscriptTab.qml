// Speaker paragraphs of clickable words. Click selects a word, Shift+click extends, and the
// selection sets In and Out. Delete lifts it, and Shift+Delete or Backspace extracts it.
// The mark on the current word is one item above the list: following the playhead moves only that
// item, as the timeline's playhead does (D30), so playback touches no model and no delegate.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: tab
    required property var session
    property var clock: null
    property var timeline: null
    property real fps: 30
    objectName: "transcriptTab"
    property int currentWord: -1
    property real currentStartMs: 0
    property real currentEndMs: 0
    property int savedRow: 0

    function syncPlayhead() {
        if (!clock) return
        const now = clock.time
        if (currentWord >= 0 && now >= currentStartMs && now < currentEndMs) return
        const word = session.wordAt(now)
        if (word === currentWord) return
        currentWord = word
        if (word < 0) { currentMark.visible = false; return }
        currentStartMs = session.wordStartMs(word)
        currentEndMs = session.wordEndMs(word)
        place(word, !followPause.running)
    }
    // Puts the mark on a word. With `reveal` the list scrolls to it when it is out of view.
    function place(word, reveal) {
        const row = session.paragraphOfWord(word)
        var item = row >= 0 ? rowsView.itemAtIndex(row) : null
        if (!item && reveal && row >= 0) {
            rowsView.positionViewAtIndex(row, ListView.Beginning)
            rowsView.forceLayout()
            item = rowsView.itemAtIndex(row)
        }
        if (!item) { if (word === currentWord) currentMark.visible = false; return }
        const box = item.words.wordRect(word)
        const at = item.words.mapToItem(rowsView.contentItem, box.x, box.y)
        if (word === currentWord) {
            currentMark.x = at.x
            currentMark.y = at.y
            currentMark.width = box.width
            currentMark.height = box.height
            currentMark.visible = box.width > 0
        }
        if (reveal) {
            if (at.y < rowsView.contentY) rowsView.contentY = at.y
            else if (at.y + box.height > rowsView.contentY + rowsView.height) rowsView.contentY = at.y + box.height - rowsView.height
        }
    }
    function replaceMark() { if (currentWord >= 0) place(currentWord, false) }
    function pickAt(item, x, y, modifiers) {
        rowsView.forceActiveFocus()
        const word = item.wordAt(x, y)
        if (word >= 0) session.selectWord(word, !!(modifiers & Qt.ShiftModifier))
    }
    function handleKey(event) {
        const shift = !!(event.modifiers & Qt.ShiftModifier)
        switch (event.key) {
        case Qt.Key_Left: session.moveSelection(-1, shift); break
        case Qt.Key_Right: session.moveSelection(1, shift); break
        case Qt.Key_Backspace: session.extract(); break
        case Qt.Key_Delete: if (shift) session.extract(); else session.lift(); break
        case Qt.Key_Escape:
            if (session.selectionFirst < 0) return
            session.clearSelection()
            break
        default: return
        }
        event.accepted = true
    }
    onVisibleChanged: if (visible) { syncPlayhead(); Qt.callLater(replaceMark) }
    Component.onCompleted: syncPlayhead()
    Connections {
        target: tab.clock
        enabled: tab.visible
        function onTimeChanged() { tab.syncPlayhead() }
    }
    Connections {
        target: tab.session
        function onRevealWord(word) { tab.place(word, true) }
        function onWordsChanged() { tab.currentWord = -1; currentMark.visible = false; Qt.callLater(tab.syncPlayhead) }
    }
    Connections {
        target: tab.session.paragraphs
        function onModelAboutToBeReset() { tab.savedRow = Math.max(0, rowsView.indexAt(0, rowsView.contentY + 1)) }
        function onModelReset() { Qt.callLater(() => {
            if (rowsView.count > 0) rowsView.positionViewAtIndex(Math.min(tab.savedRow, rowsView.count - 1), ListView.Beginning)
            tab.replaceMark()
        }) }
    }
    // Reading ahead during playback: the list stays where the person put it for a moment.
    Timer { id: followPause; interval: 3000 }

    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.Metrics.md
        visible: tab.session.wordCount > 0
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.xs
            Ui.TextField {
                id: searchField
                objectName: "transcriptSearch"
                Layout.fillWidth: true
                density: Ui.EditorButton.Compact
                accessibleName: "Find words"
                placeholderText: "Find words"
                selectByMouse: true
                onTextChanged: tab.session.query = text
                Keys.onReturnPressed: event => { tab.session.stepMatch(event.modifiers & Qt.ShiftModifier ? -1 : 1); event.accepted = true }
                Keys.onEnterPressed: event => { tab.session.stepMatch(event.modifiers & Qt.ShiftModifier ? -1 : 1); event.accepted = true }
            }
            Ui.Text {
                objectName: "transcriptMatchCount"
                visible: tab.session.query.trim() !== ""
                text: tab.session.matchCount === 0 ? "No matches"
                      : tab.session.currentMatch >= 0 ? (tab.session.currentMatch + 1) + " of " + tab.session.matchCount
                      : tab.session.matchCount === 1 ? "1 match" : tab.session.matchCount + " matches"
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            Ui.ToolbarIconButton {
                objectName: "transcriptPreviousMatch"
                iconName: "arrowUpward"
                accessibleName: "Previous match"
                enabled: tab.session.matchCount > 0
                disabledReason: "Type words to find first."
                onClicked: tab.session.stepMatch(-1)
            }
            Ui.ToolbarIconButton {
                objectName: "transcriptNextMatch"
                iconName: "arrowDownward"
                accessibleName: "Next match"
                enabled: tab.session.matchCount > 0
                disabledReason: "Type words to find first."
                onClicked: tab.session.stepMatch(1)
            }
        }
        ListView {
            id: rowsView
            objectName: "transcriptParagraphs"
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: tab.session.paragraphs
            activeFocusOnTab: true
            keyNavigationEnabled: false
            boundsBehavior: Flickable.StopAtBounds
            spacing: Ui.Metrics.lg
            cacheBuffer: Ui.Metrics.touch * 8
            ScrollBar.vertical: Ui.ScrollBar {}
            Accessible.role: Accessible.List
            Accessible.name: "Transcript. Left and Right select words. Delete lifts them. Shift+Delete extracts them."
            Keys.onPressed: event => tab.handleKey(event)
            onMovementStarted: followPause.restart()
            onContentHeightChanged: Qt.callLater(tab.replaceMark)
            delegate: Column {
                id: paragraph
                required property int index
                required property int firstWord
                required property int wordCount
                required property string speaker
                required property real startMs
                required property string text
                readonly property alias words: wordsItem
                objectName: "transcriptParagraph_" + index
                width: ListView.view.width - Ui.Metrics.lg
                spacing: Ui.Metrics.micro
                Component.onCompleted: Qt.callLater(tab.replaceMark)
                Accessible.role: Accessible.StaticText
                Accessible.name: (speaker ? speaker + ": " : "") + text
                Ui.Text {
                    width: parent.width
                    text: (paragraph.speaker ? paragraph.speaker + "  " : "") + TimelineFormat.playheadTimecode(paragraph.startMs, tab.fps)
                    role: Ui.Typography.MonoCaption
                    tone: Ui.Text.Secondary
                    elide: Text.ElideRight
                }
                TranscriptWords {
                    id: wordsItem
                    width: parent.width
                    height: implicitHeight
                    session: tab.session
                    firstWord: paragraph.firstWord
                    wordCount: paragraph.wordCount
                    text: paragraph.text
                    font: Ui.Typography.font(Ui.Typography.SansBody)
                    lineScale: Ui.Typography.lineHeight(Ui.Typography.SansBody)
                    color: Ui.Theme.textPrimary
                    selectionColor: Ui.Theme.actionSelected
                    matchColor: Ui.Theme.actionHover
                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: mouse => tab.pickAt(wordsItem, mouse.x, mouse.y, mouse.modifiers)
                    }
                }
            }
            Rectangle {
                id: currentMark
                objectName: "transcriptCurrentWord"
                parent: rowsView.contentItem
                visible: false
                z: Ui.Metrics.layerOverlay
                color: Ui.Theme.accentPrimary
                opacity: 0.35
                radius: Ui.Metrics.micro
            }
        }
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Ui.Text {
                objectName: "transcriptSelection"
                Layout.fillWidth: true
                text: tab.session.selectionFirst >= 0 ? tab.session.selectionText : "Click or Shift+click words"
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                elide: Text.ElideRight
            }
            Ui.EditorButton {
                objectName: "transcriptLift"
                density: Ui.EditorButton.Compact
                text: "Lift"
                description: "Remove the selected words and leave a gap."
                enabled: tab.session.selectionFirst >= 0
                disabledReason: "Select words to lift."
                onClicked: tab.session.lift()
            }
            Ui.EditorButton {
                objectName: "transcriptExtract"
                density: Ui.EditorButton.Compact
                text: "Extract"
                description: "Remove the selected words and close the gap."
                enabled: tab.session.selectionFirst >= 0
                disabledReason: "Select words to extract."
                onClicked: tab.session.extract()
            }
        }
    }
    TranscriptRequest {
        id: request
        timeline: tab.timeline
        property string waitingClip: ""
        property bool applying: false
        onChanged: {
            if (waitingClip !== "" && ready && !busy) {
                const clip = waitingClip
                waitingClip = ""
                submit(clip, "openai", "whisper-1")
            } else if (hasCandidate && !busy && !applying) {
                applying = true
                apply()
                applying = false
            }
        }
    }
    function transcribe() {
        if (session.transcribeClipId === "") return
        request.waitingClip = session.transcribeClipId
        if (!request.ready && !request.open()) request.waitingClip = ""
        else if (request.ready) request.changed()
    }
    Column {
        objectName: "transcriptNextStep"
        anchors.centerIn: parent
        width: parent.width - 2 * Ui.Metrics.md
        spacing: Ui.Metrics.md
        visible: tab.session.wordCount === 0
        Ui.EmptyState {
            id: nextStep
            objectName: "transcriptEmptyState"
            width: parent.width
            maxTextWidth: parent.width
            title: "No word timing yet"
            message: tab.session.hiddenWords > 0
                     ? "Words on reversed, time-remapped or disabled clips cannot be edited as text. Turn those settings off, or transcribe another clip."
                     : tab.session.transcribeClipId !== ""
                       ? "Transcribe “" + tab.session.transcribeClipName + "” to edit it as text, or voice a line in Script. Words appear here with their timing."
                       : "Add an audio or video clip to the timeline and transcribe it here, or voice a line in Script."
            actionText: tab.session.transcribeClipId !== "" ? (request.busy ? "Transcribing…" : "Transcribe clip") : ""
            onActionTriggered: if (!request.busy) tab.transcribe()
        }
        Ui.Text {
            objectName: "transcriptRequestError"
            width: parent.width
            visible: request.error !== ""
            text: request.error
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Error
            wrapMode: Text.Wrap
            horizontalAlignment: Text.AlignHCenter
        }
    }
}
