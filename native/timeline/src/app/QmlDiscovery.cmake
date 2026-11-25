# Explicit list of QML and JS resources under qml/ (excluding /tests/).
# Callers such as MarkerDiscoveryTest.cmake may override NT_QML_DISCOVERY_FILES.
if(NOT DEFINED NT_QML_DISCOVERY_FILES)
    set(NT_QML_DISCOVERY_FILES
        qml/DocumentBar.qml
        qml/DocumentFileBanner.qml
        qml/ExportVideoDialog.qml
        qml/Inspector/AudioEffectsFields.qml
        qml/Inspector/AudioEffectsKnobs.js
        qml/Inspector/AudioFadeShapes.js
        qml/Inspector/AudioGainDialog.qml
        qml/Inspector/AudioGainHost.qml
        qml/Inspector/AudioSection.qml
        qml/Inspector/CaptionStyle.qml
        qml/Inspector/KeyframeAnimations.qml
        qml/Inspector/KeyframeButton.qml
        qml/Inspector/KeyframeClipAnimationEditor.qml
        qml/Inspector/KeyframeClipCustomCurves.qml
        qml/Inspector/KeyframeClipDiamonds.qml
        qml/Inspector/MotionAnimationCatalog.qml
        qml/Inspector/MotionAnimationParam.qml
        qml/Inspector/MotionEasingField.qml
        qml/Inspector/ReframeButton.qml
        qml/Inspector/ReframeCaption.qml
        qml/Inspector/ReframeFocusOverlay.qml
        qml/Inspector/ReframePreview.qml
        qml/Inspector/ReframeSection.qml
        qml/Inspector/ShapeSection.qml
        qml/Inspector/SpeedDurationDialog.qml
        qml/Inspector/SpeedTimeRemap.qml
        qml/Inspector/TextContentInput.qml
        qml/Inspector/TextFillFields.qml
        qml/Inspector/TextFontPicker.qml
        qml/Inspector/TextStyleEdits.qml
        qml/Inspector/TextStyleNumber.qml
        qml/Inspector/TextStyleSection.qml
        qml/Inspector/TimelineInspector.qml
        qml/Inspector/TransitionEasingField.qml
        qml/Inspector/TransitionSection.qml
        qml/Inspector/primitives/ClipIdentityCard.qml
        qml/Inspector/primitives/InspectorCard.qml
        qml/Inspector/primitives/InspectorColour.qml
        qml/Inspector/primitives/InspectorDivider.qml
        qml/Inspector/primitives/InspectorHeader.qml
        qml/Inspector/primitives/InspectorPillInput.qml
        qml/Inspector/primitives/InspectorPrimitivesHelpers.js
        qml/Inspector/primitives/InspectorRow.qml
        qml/Inspector/primitives/InspectorSection.qml
        qml/Inspector/primitives/InspectorSectionTitle.qml
        qml/Inspector/primitives/InspectorSelect.qml
        qml/Inspector/primitives/InspectorSliderRow.qml
        qml/Inspector/primitives/InspectorStaticValue.qml
        qml/Inspector/primitives/InspectorToggleRow.qml
        qml/Inspector/primitives/InspectorTokens.qml
        qml/PasteAttributesDialog.qml
        qml/Preferences/AppShell.qml
        qml/Preferences/KeyboardLayoutPrompt.qml
        qml/Preferences/PreferencesDialog.qml
        qml/ProjectSettingsDialog.qml
        qml/SaveBanners.qml
        qml/SaveStatus.qml
        qml/SourceDragArea.qml
        qml/SourceRangeBar.qml
        qml/SourceViewerPanel.qml
        qml/TimelineDocumentActions.qml
        qml/TimelineEditor.qml
        qml/TimelineListPanel.qml
        qml/TimelineMetrics.qml
        qml/TimelineVisuals.qml
        qml/Tracks/AddTrackButton.qml
        qml/Tracks/Clip.qml
        qml/Tracks/ClipBody.qml
        qml/Tracks/ClipFadeGrips.qml
        qml/Tracks/ClipFadeShapeMenu.qml
        qml/Tracks/FadeRamp.qml
        qml/Tracks/GridDivisionSelect.qml
        qml/Tracks/GroupBracket.qml
        qml/Tracks/MidiNoteLines.qml
        qml/Tracks/Playhead.qml
        qml/Tracks/RubberBandOverlay.qml
        qml/Tracks/ShortcutsSheet.qml
        qml/Tracks/TimeRuler.qml
        qml/Tracks/TimelineScrollbar.qml
        qml/Tracks/TimelineZoomControls.qml
        qml/Tracks/ToolButton.qml
        qml/Tracks/ToolToggle.qml
        qml/Tracks/ToolbarDivider.qml
        qml/Tracks/TrackHeader.qml
        qml/Tracks/TrackHeaderMenu.qml
        qml/Tracks/TrackHeightSlider.qml
        qml/Tracks/TrackIconButton.qml
        qml/Tracks/TrackLane.qml
        qml/Tracks/TracksRegion.qml
        qml/Tracks/TrimEditMarks.qml
        qml/Tracks/automation/AutomationAddLaneHeader.qml
        qml/Tracks/automation/AutomationCurveOverlay.qml
        qml/Tracks/automation/AutomationHeaderRow.qml
        qml/Tracks/automation/AutomationLaneHeader.qml
        qml/Tracks/automation/AutomationLaneHeaders.qml
        qml/Tracks/automation/AutomationLaneView.qml
        qml/Tracks/automation/AutomationLanes.qml
        qml/Tracks/automation/AutomationUIState.qml
        qml/Tracks/automation/automationLayout.js
        qml/Tracks/automation/automationTargets.js
        qml/UnsupportedColorVersion.qml
        qml/activity/ActivityPanel.qml
        qml/ai/AiInspectorSection.qml
        qml/ai/AiPanel.qml
        qml/ai/ClipOperations.qml
        qml/ai/GenerateToolbar.qml
        qml/ai/LineDelivery.qml
        qml/ai/RegenerateClip.qml
        qml/ai/WorkflowClip.qml
        qml/aiassist/TimelineAgentPanel.qml
        qml/assets/AssetContext.js
        qml/assets/AssetDropOverlay.qml
        qml/assets/AssetExplorer.qml
        qml/assets/AssetPreview.qml
        qml/assets/LibraryActionDialog.qml
        qml/assets/LibraryButton.qml
        qml/assets/LibraryField.qml
        qml/assets/LibraryLabel.qml
        qml/assets/ProjectFolderNotice.qml
        qml/audio/AudioPanel.qml
        qml/audio/LoudnessMeterView.qml
        qml/audio/loudnessFormat.js
        qml/color/ColorPanel.qml
        qml/color/ColorWheel.qml
        qml/color/ColorWheelMath.js
        qml/color/ScopeGrid.qml
        qml/color/ScopeTile.qml
        qml/color/ScopesPanel.qml
        qml/dock/DockCanvas.qml
        qml/dock/DockGroup.qml
        qml/dock/DockLayout.js
        qml/dock/DockLayoutMenu.qml
        qml/dock/DockPanelHeader.qml
        qml/dock/DockRegionView.qml
        qml/dock/DockResizeHandle.qml
        qml/dock/DockTabStrip.qml
        qml/dock/StablePanelHost.qml
        qml/dock/TimelineTracksPanel.qml
        qml/effectcontrols/EffectControlsDiamond.qml
        qml/effectcontrols/EffectControlsGraph.qml
        qml/effectcontrols/EffectControlsGroup.qml
        qml/effectcontrols/EffectControlsHandle.qml
        qml/effectcontrols/EffectControlsModel.js
        qml/effectcontrols/EffectControlsPanel.qml
        qml/effectcontrols/EffectControlsRow.qml
        qml/effectcontrols/EffectControlsRuler.qml
        qml/effectmasks/EffectMaskOverlay.qml
        qml/effects/EffectDropOverlay.qml
        qml/effects/EffectsPanel.qml
        qml/effects/EffectsPanelRow.qml
        qml/entities/EntityAssistPopover.qml
        qml/entities/EntityEditorDialog.qml
        qml/entities/EntityPanel.qml
        qml/entities/EntityReferenceDialog.qml
        qml/export/ExportFramePanel.qml
        qml/export/ExportQueueCard.qml
        qml/export/QuickExportButton.qml
        qml/files/FilesDock.qml
        qml/framehold/FrameHoldHost.qml
        qml/fx/FxKnob.qml
        qml/fx/FxParams.js
        qml/fx/FxPower.qml
        qml/fx/FxStepper.qml
        qml/interchange/PremierePanel.qml
        qml/markers/MarkerEditDialog.qml
        qml/markers/MarkerEditHost.qml
        qml/markers/MarkerLane.qml
        qml/markers/MarkerLaneLayout.js
        qml/markers/MarkersPanel.qml
        qml/menus/ClipContextMenu.qml
        qml/menus/ClipMenuEntry.qml
        qml/menus/MenuActionItem.qml
        qml/menus/TrackLaneContextMenu.qml
        qml/mixer/ChannelStrip.qml
        qml/mixer/ChannelStripView.qml
        qml/mixer/EffectDevicePopover.qml
        qml/mixer/InsertSlots.qml
        qml/mixer/InstrumentDevicePopover.qml
        qml/mixer/MixerCompressorCurve.qml
        qml/mixer/MixerEq3Curve.qml
        qml/mixer/MixerFader.qml
        qml/mixer/MixerMeter.qml
        qml/mixer/MixerPanel.qml
        qml/mixer/MixerToolbar.qml
        qml/mixer/MixerView.qml
        qml/mixer/effectCurves.js
        qml/mixer/faderTaper.js
        qml/mixer/meterLevels.js
        qml/motionpanel/MotionPanel.qml
        qml/music/MusicCleanupHost.qml
        qml/music/MusicClipJob.qml
        qml/music/MusicContextBracket.qml
        qml/music/MusicControlBar.qml
        qml/music/MusicHint.qml
        qml/music/MusicJobList.qml
        qml/music/MusicLayout.js
        qml/music/MusicMode.qml
        qml/music/MusicPanel.qml
        qml/music/MusicProjectWindow.qml
        qml/music/MusicRangeOverlay.qml
        qml/music/MusicRangeTool.qml
        qml/music/MusicSectionRange.qml
        qml/music/MusicSetup.qml
        qml/music/MusicSnap.js
        qml/music/MusicTakeList.qml
        qml/music/MusicToast.qml
        qml/music/MusicToolbar.qml
        qml/music/NewMusicProjectDialog.qml
        qml/pianoroll/PianoRollInspector.qml
        qml/pianoroll/PianoRollLanes.js
        qml/pianoroll/PianoRollNotes.js
        qml/pianoroll/PianoRollPanel.qml
        qml/pianoroll/PianoRollToolbar.qml
        qml/pianoroll/PianoRollTools.js
        qml/pianoroll/StepEditorInspector.qml
        qml/pianoroll/StepEditorModel.js
        qml/pianoroll/StepEditorPanel.qml
        qml/pianoroll/StepEditorRow.qml
        qml/pianoroll/StepEditorToolbar.qml
        qml/preview/ClipTransformContextMenu.qml
        qml/preview/MonitorGuides.qml
        qml/preview/MonitorRulers.qml
        qml/preview/MonitorSafeMargins.qml
        qml/preview/MonitorSettingsMenu.qml
        qml/preview/MonitorZoomMenu.qml
        qml/preview/PreviewArea.qml
        qml/preview/TimecodeField.qml
        qml/preview/TransformGizmoOverlay.qml
        qml/preview/TrimMonitorView.qml
        qml/providersettings/ProviderSettingsDialog.qml
        qml/reference/ComparisonView.qml
        qml/reference/ReferencePanel.qml
        qml/remix/RemixDialog.qml
        qml/remix/RemixHost.qml
        qml/remix/RemixPlanStrip.qml
        qml/scenedetect/SceneEditDialog.qml
        qml/stepsequencer/StepSequencerBrowser.qml
        qml/stepsequencer/StepSequencerInspector.qml
        qml/stepsequencer/StepSequencerModes.js
        qml/stepsequencer/StepSequencerPanel.qml
        qml/stepsequencer/StepSequencerPatternBar.qml
        qml/stepsequencer/StepSequencerRow.qml
        qml/stepsequencer/StepSequencerToolbar.qml
        qml/scenedetect/SceneEditHost.qml
        qml/storyworkspace/ScriptVoicePicker.qml
        qml/storyworkspace/ShotClipPlayer.qml
        qml/storyworkspace/StoryWorkspaceEditor.qml
        qml/storyworkspace/StoryWorkspacePanel.qml
        qml/storyworkspace/StoryboardPanel.qml
        qml/takes/TakeBadge.qml
        qml/takes/TakeGridView.qml
        qml/takes/TakeStatus.qml
        qml/transcript/CaptionsTab.qml
        qml/transcript/TextPanel.qml
        qml/transcript/TranscriptTab.qml
        qml/vst/VstPluginControl.qml
        qml/vst/VstStateSync.qml
        qml/wiring/FrameGizmoOverlay.qml
        qml/wiring/RegistryContextMenu.qml
        qml/wiring/RegistryMenuItems.qml
        qml/wiring/SlotItems.qml
        qml/wiring/w/ChromaKeyEditor.qml
        qml/wiring/w/ColorCorrectionEditor.qml
        qml/wiring/w/CompressorCurve.qml
        qml/wiring/w/CompressorEditor.qml
        qml/wiring/w/CurveMath.js
        qml/wiring/w/EffectCard.qml
        qml/wiring/w/EffectEditor.qml
        qml/wiring/w/Eq3Curve.qml
        qml/wiring/w/Eq3Editor.qml
        qml/wiring/w/ExportButton.qml
        qml/wiring/w/FilterEditor.qml
        qml/wiring/w/GainEditor.qml
        qml/wiring/w/KnobList.qml
        qml/wiring/w/SharpenEditor.qml
        qml/wiring/w/SpeedDurationHost.qml
        qml/wiring/w/TrackEffectParams.qml
        qml/wiring/w/TrackEffectsButton.qml
        qml/wiring/w/TrackEffectsDockPanel.qml
        qml/wiring/w/TrackEffectsHost.qml
        qml/wiring/w/TrackEffectsPanel.qml
        qml/wiring/w/TrackEffectsState.qml
        qml/wiring/w/VideoBlurEditor.qml
        qml/wiring/w/VignetteEditor.qml
    )
endif()
set(discovered_qml ${NT_QML_DISCOVERY_FILES})
list(FILTER discovered_qml EXCLUDE REGEX "/tests/")
list(SORT discovered_qml)
list(APPEND NT_qml_files ${discovered_qml})
list(REMOVE_DUPLICATES NT_qml_files)

set(panel_code "#include \"app/PanelRegistry.h\"\nnamespace {\nconst bool qmlPanels = [] {\n")
set(panel_ids "")
foreach(source IN LISTS discovered_qml)
    file(READ "${CMAKE_CURRENT_SOURCE_DIR}/${source}" content)
    if(source MATCHES "\\.qml$" AND content MATCHES "^[ \t\r\n]*pragma[ \t]+Singleton([ \t\r\n]|$)")
        set_source_files_properties("${source}" PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
    endif()
    string(REGEX MATCHALL "[^\n]*nt-panel:[^\n]*" markers "${content}")
    foreach(marker IN LISTS markers)
        if(NOT source MATCHES "\\.qml$" OR NOT marker MATCHES "^[ \t]*// nt-panel: slot=([a-z][A-Za-z0-9]*) id=([A-Za-z_][A-Za-z0-9_.-]*) order=(-?[0-9]+) title=\"([^\"\\;]*)\"[ \t\r]*$")
            message(FATAL_ERROR "${source}: malformed nt-panel marker: ${marker}")
        endif()
        set(slot "${CMAKE_MATCH_1}")
        set(id "${CMAKE_MATCH_2}")
        set(order "${CMAKE_MATCH_3}")
        set(title "${CMAKE_MATCH_4}")
        if(order LESS -2147483648 OR order GREATER 2147483647)
            message(FATAL_ERROR "${source}: malformed nt-panel order: ${order}")
        endif()
        if(id IN_LIST panel_ids)
            message(FATAL_ERROR "${source}: duplicate nt-panel id: ${id}")
        endif()
        list(APPEND panel_ids "${id}")
        # Generate the order as a checked decimal string, avoiding C++ octal literals.
        string(REPLACE "\\" "\\\\" url "qrc:/qt/qml/NodeTool/Timeline/${source}")
        string(REPLACE "\"" "\\\"" url "${url}")
        string(APPEND panel_code "    nt::app::registerPanel({QStringLiteral(\"${slot}\"), QStringLiteral(\"${id}\"), QUrl(QStringLiteral(\"${url}\")), QStringLiteral(\"${order}\").toInt(), QStringLiteral(\"${title}\")});\n")
    endforeach()
endforeach()
string(APPEND panel_code "    return true;\n}();\n}\n")
file(CONFIGURE OUTPUT "${CMAKE_CURRENT_BINARY_DIR}/nt_qml_panels.cpp" CONTENT "${panel_code}" @ONLY)
# Static libraries may discard a registrar. Compile directly into each QML executable.
list(APPEND NT_qml "${CMAKE_CURRENT_BINARY_DIR}/nt_qml_panels.cpp")
