// JSON text of kernel values that hold bytes (PT13).
//
// A value leaves the kernel in one of two forms. A host and the durable
// store read bytes as {"__bytes__": "<base64>"} with their type tags, the
// form guest/values.mjs writes: dumpWire(). The guest reads bytes from a
// list that travels next to the text, and the text holds a marker
// {"__blob__": <index>} with the same tags in their place: dumpTransit().
// attachBlobs() is the way back, for text the guest wrote.
#pragma once

#include "kernel/json.h"

#include <string>
#include <vector>

namespace gr {

// True when `value` holds bytes anywhere.
bool holdsBytes(const Json& value);

// The text Json::dump(-1, ' ', false, handler) gives, with each byte value
// written as {"__bytes__": "<base64>"}, {"__bytes__": "<base64>",
// "__buffer__": true} for a Buffer, or {"__typed__": "<type>",
// "__bytes__": "<base64>"} for any other type.
std::string dumpWire(const Json& value,
                     Json::error_handler_t handler = Json::error_handler_t::strict);

// The text for the guest. Each byte value becomes {"__blob__": <index>}
// with its tags, and its Blob is appended to `blobs` at that index. A value
// that already holds an object with a "__blob__" key cannot use markers:
// it is written as dumpWire() writes it, and `blobs` stays empty.
std::string dumpTransit(const Json& value, std::vector<Blob>& blobs);

// Replaces each marker {"__blob__": <index>} in `value` with the bytes of
// blobs[index] as the type its tags name. The writer of the text guarantees
// that only markers have a "__blob__" key (dumpTransit, guest/values.mjs).
void attachBlobs(Json& value, const std::vector<Blob>& blobs);

}  // namespace gr
