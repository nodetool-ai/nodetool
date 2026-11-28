cmake_minimum_required(VERSION 3.24)
# The audio device layer shared by the timeline player and the realtime engine
# (realtime design 14.4): the miniaudio playback device and its null backend,
# AudioClockFeed with its seqlocks, OutputLatency and PcmRing. It depends on
# the standard library and miniaudio only. Consumers add this directory with
# add_subdirectory and link nodetool_audio_io. Tests that count allocations
# link nodetool_audio_io_test_support.
project(NodeToolAudioIo LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_SCAN_FOR_MODULES OFF)
if(PROJECT_IS_TOP_LEVEL)
    include(CTest)
endif()
find_package(Threads REQUIRED)

if(APPLE)
    set(NT_AUDIO_IO_PLATFORM_LIBS "-framework CoreAudio" "-framework AudioToolbox" "-framework CoreFoundation")
elseif(UNIX)
    # miniaudio loads ALSA and PulseAudio at runtime.
    set(NT_AUDIO_IO_PLATFORM_LIBS ${CMAKE_DL_LIBS} m)
else()
    set(NT_AUDIO_IO_PLATFORM_LIBS "")
endif()
if(MSVC)
    set(NT_AUDIO_IO_WARNINGS /W4)
    set(NT_AUDIO_IO_NO_WARNINGS /w)
else()
    set(NT_AUDIO_IO_WARNINGS -Wall -Wextra)
    set(NT_AUDIO_IO_NO_WARNINGS -w)
endif()

add_library(nodetool_audio_io STATIC
    src/audio/OutputLatency.h
    src/audio/OutputLatency.cpp
    src/audio/PcmRing.h
    src/audio/PlaybackDevice.h
    src/audio/PlaybackDevice.cpp
    src/audio/miniaudio.cpp
    src/playback/AudioClockFeed.h
    src/playback/AudioClockFeed.cpp)
# third_party is public: LoopbackCapture and the realtime spikes use the
# miniaudio API that this library compiles once.
target_include_directories(nodetool_audio_io PUBLIC src third_party)
target_link_libraries(nodetool_audio_io PUBLIC Threads::Threads PRIVATE ${NT_AUDIO_IO_PLATFORM_LIBS})
target_compile_options(nodetool_audio_io PRIVATE ${NT_AUDIO_IO_WARNINGS})
set_source_files_properties(src/audio/miniaudio.cpp PROPERTIES COMPILE_OPTIONS "${NT_AUDIO_IO_NO_WARNINGS}")
if(CMAKE_CXX_COMPILER_ID STREQUAL "AppleClang")
    target_link_options(nodetool_audio_io INTERFACE -fexperimental-library)
endif()

add_library(nodetool_audio_io_test_support INTERFACE)
target_include_directories(nodetool_audio_io_test_support INTERFACE tests/support)

if(PROJECT_IS_TOP_LEVEL AND BUILD_TESTING)
    add_executable(audio-io-test tests/audio_io_test.cpp)
    target_link_libraries(audio-io-test PRIVATE nodetool_audio_io nodetool_audio_io_test_support)
    target_compile_options(audio-io-test PRIVATE ${NT_AUDIO_IO_WARNINGS})
    add_test(NAME audio-io COMMAND audio-io-test)
    set_tests_properties(audio-io PROPERTIES TIMEOUT 60)
endif()
