// The miniaudio implementation (third_party/miniaudio.h, MIT No Attribution
// or public domain), compiled once. Only the playback device API and the
// null and system backends are used; the decoders, the encoders and the
// node graph are left out.
#define MA_NO_DECODING
#define MA_NO_ENCODING
#define MA_NO_GENERATION
#define MA_NO_RESOURCE_MANAGER
#define MA_NO_NODE_GRAPH
#define MA_NO_ENGINE
#define MINIAUDIO_IMPLEMENTATION
#include "miniaudio.h"
