#include "TransitionEdits.h"
#include "app/EditRegistry.h"
namespace {
const bool set = nt::app::registerEdit("setClipTransition", nt::edit::transitions::setClipTransition);
const bool duration = nt::app::registerEdit("setTransitionDuration", nt::edit::transitions::setTransitionDuration);
const bool remove = nt::app::registerEdit("removeTransition", nt::edit::transitions::removeTransition);
}
