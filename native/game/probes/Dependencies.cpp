#include <Jolt/Jolt.h>
#include <Jolt/RegisterTypes.h>
#include <Jolt/Core/Factory.h>
#include <Jolt/Core/TempAllocator.h>
#include <Jolt/Core/JobSystemSingleThreaded.h>
#include <Jolt/Physics/PhysicsSystem.h>
#include <Jolt/Physics/Body/BodyCreationSettings.h>
#include <Jolt/Physics/Collision/Shape/SphereShape.h>
extern "C" {
#include <quickjs.h>
}
#include <cmath>
#include <iostream>
#include <memory>

namespace {
struct RuntimeDeleter { void operator()(JSRuntime* value) const { JS_FreeRuntime(value); } };
struct ContextDeleter { void operator()(JSContext* value) const { JS_FreeContext(value); } };
class BroadPhase final : public JPH::BroadPhaseLayerInterface {
public:
    JPH::uint GetNumBroadPhaseLayers() const override { return 1; }
    JPH::BroadPhaseLayer GetBroadPhaseLayer(JPH::ObjectLayer) const override { return JPH::BroadPhaseLayer(0); }
#if defined(JPH_EXTERNAL_PROFILE) || defined(JPH_PROFILE_ENABLED)
    const char* GetBroadPhaseLayerName(JPH::BroadPhaseLayer) const override { return "all"; }
#endif
};
class BroadFilter final : public JPH::ObjectVsBroadPhaseLayerFilter {
public:
    bool ShouldCollide(JPH::ObjectLayer, JPH::BroadPhaseLayer) const override { return true; }
};
class PairFilter final : public JPH::ObjectLayerPairFilter {
public:
    bool ShouldCollide(JPH::ObjectLayer, JPH::ObjectLayer) const override { return true; }
};
}
int main() {
    std::unique_ptr<JSRuntime, RuntimeDeleter> runtime(JS_NewRuntime());
    if (!runtime) { return 1; }
    JS_SetMemoryLimit(runtime.get(), 8 * 1024 * 1024);
    std::unique_ptr<JSContext, ContextDeleter> context(JS_NewContext(runtime.get()));
    if (!context) { return 2; }
    constexpr char source[] = "JSON.stringify({state:{score:6*7}})";
    JSValue result = JS_Eval(context.get(), source, sizeof(source) - 1, "probe.js", JS_EVAL_TYPE_GLOBAL);
    const char* text = JS_ToCString(context.get(), result);
    const bool scriptOk = !JS_IsException(result) && text && std::string(text) == "{\"state\":{\"score\":42}}";
    if (text) { JS_FreeCString(context.get(), text); }
    JS_FreeValue(context.get(), result);
    if (!scriptOk) { return 3; }

    JPH::RegisterDefaultAllocator();
    const auto factory = std::make_unique<JPH::Factory>();
    JPH::Factory::sInstance = factory.get();
    JPH::RegisterTypes();
    bool physicsOk = false;
    {
        BroadPhase broadPhase;
        BroadFilter broadFilter;
        PairFilter pairFilter;
        JPH::PhysicsSystem world;
        world.Init(16, 0, 16, 16, broadPhase, broadFilter, pairFilter);
        JPH::TempAllocatorImpl allocator(1024 * 1024);
        JPH::JobSystemSingleThreaded jobs(JPH::cMaxPhysicsJobs);
        auto& bodies = world.GetBodyInterface();
        const auto body = bodies.CreateAndAddBody(JPH::BodyCreationSettings(new JPH::SphereShape(0.5F),
            JPH::RVec3(0, 10, 0), JPH::Quat::sIdentity(), JPH::EMotionType::Dynamic, 0), JPH::EActivation::Activate);
        const auto status = world.Update(1.0F / 60.0F, 1, &allocator, &jobs);
        const auto height = bodies.GetPosition(body).GetY();
        physicsOk = status == JPH::EPhysicsUpdateError::None && std::isfinite(height) && height < 10;
        bodies.RemoveBody(body);
        bodies.DestroyBody(body);
    }
    JPH::UnregisterTypes();
    JPH::Factory::sInstance = nullptr;
    if (!physicsOk) { return 4; }
    std::cout << "QuickJS state evaluation and Jolt fixed step passed\n";
    return 0;
}
