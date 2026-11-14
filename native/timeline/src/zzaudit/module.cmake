# Local audit harness, not committed.
function(nt_zzaudit_tests)
    qt_add_executable(edit_fuzz src/zzaudit/edit_fuzz.cpp src/server/sync/SyncRegistration.cpp src/server/recovery/RecoveryRegistration.cpp src/edit/transitions/TransitionRegistrations.cpp src/edit/clipboard/ClipboardRegistrations.cpp src/edit/tracks/TrackEditRegistrations.cpp src/edit/registry/RippleRegistrations.cpp src/edit/targeting/TargetingEditRegistrations.cpp src/edit/speed/SpeedRegistrations.cpp src/edit/framehold/FrameHoldRegistrations.cpp src/edit/groups/GroupRegistrations.cpp src/audio/automation/Registrations.cpp src/preview/crop/ReframeRegistrations.cpp)
    target_link_libraries(edit_fuzz PRIVATE timeline_core timeline_server Qt6::Gui Qt6::Qml Qt6::Quick)
    nt_add_timeline_qml(edit_fuzz)
endfunction()
nt_tests(nt_zzaudit_tests)
