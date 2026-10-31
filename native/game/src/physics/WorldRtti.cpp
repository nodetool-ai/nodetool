#include "World.h"
namespace nodetool::game {
// Emit the polymorphic spatial boundary with RTTI while Jolt stays RTTI-free.
PhysicsWorld::~PhysicsWorld() = default;
}
