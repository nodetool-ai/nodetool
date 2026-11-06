#pragma once

// The headless save harness (M5b):
//
//   nodetool-timeline --server URL --timeline ID --save
//       [--move-clip CLIP:MS] [--set-clip-field CLIP:KEY=JSON]
//       [--wait-before-save FILE] [--wait-before-write FILE] [--autosave] [--save-report FILE]
//
// Loads the timeline, applies each edit as one undo command on a
// TimelineModel, and saves through AutosaveController. --wait-before-save
// prints `{"loaded":...}` and waits until FILE exists (a second client can
// save in between). --autosave waits for the debounced save instead of
// calling it. Prints one JSON line: ok, conflict, updatedAt, stripped,
// dirty before and after, the error, and the kept copy. Exit 0 on a save,
// 3 on a conflict, 1 on any other failure.

namespace nt::server {

int saveCli(int argc, char** argv);

}  // namespace nt::server
