# Code video.addAudio(..., {keepOriginalAudio:true}) preserves separate tracks.
# Reuse the native media dependency and explicit host grants.
target_sources(gr_kernel PRIVATE ${CMAKE_CURRENT_LIST_DIR}/../src/host/sandbox_av_tracks.cpp)
target_link_libraries(gr_kernel PRIVATE PkgConfig::GR_MEDIA)
