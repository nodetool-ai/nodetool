import type { Collider, ColliderDesc, KinematicCharacterController, RigidBody, World } from "@dimforge/rapier3d-compat";
import type { GameCollider3D, GameInputFrame3D, GameScene3D, GameScriptCommand3D, GameSnapshot3D, GameVector3 } from "@nodetool-ai/protocol";
import { add3, approach, multiplyQuaternion, quaternionArray, quaternionObject, quantizeSpatial3D, scale3, ZERO3 } from "./math.js";
import { base64ToBytes, bytesToBase64 } from "./digest.js";
import { pairKey3D, type Contact3D, type EntityState3D } from "./state.js";

export const GAME_PHYSICS_BUILD_3D = "rapier3d-compat@0.19.3:sha256:1ce1c8c4036b4dcd3bde86c6efdb0f270cf5e274979b1de6ab8052947ef166c5";
const CONTROLLER_OFFSET = 0.01;
const MAX_SPATIAL_OBSERVATIONS = 512;
const MAX_SENSOR_CASTS = 16_384;
type Rapier = typeof import("@dimforge/rapier3d-compat").default;
let preparedRapier: Promise<Rapier> | undefined;

export interface PreparedCollider3D {
  readonly vertices: Float32Array;
  readonly indices?: Uint32Array;
}

export async function prepareRapier3D(): Promise<Rapier> {
  preparedRapier ??= import("@dimforge/rapier3d-compat").then(async (module) => {
    await module.default.init();
    return module.default;
  });
  return preparedRapier;
}

function collisionGroups(definition: GameCollider3D): number {
  return ((definition.category << 16) | definition.mask) >>> 0;
}

function compatible(a: Collider, b: Collider): boolean {
  const ag = a.collisionGroups();
  const bg = b.collisionGroups();
  return ((ag >>> 16) & (bg & 0xffff)) !== 0 && ((bg >>> 16) & (ag & 0xffff)) !== 0;
}

interface BodyRecord3D {
  readonly body?: RigidBody;
  readonly collider?: Collider;
  readonly controller?: KinematicCharacterController;
}

export class SpatialWorld3D {
  readonly rapier: Rapier;
  world: World;
  private readonly gravity: GameVector3;
  private readonly records = new Map<string, BodyRecord3D>();
  private readonly colliderEntities = new Map<number, string>();
  private readonly prepared: ReadonlyMap<string, PreparedCollider3D>;
  private disposed = false;

  constructor(rapier: Rapier, scene: GameScene3D, states: readonly EntityState3D[], prepared: ReadonlyMap<string, PreparedCollider3D>, snapshot?: GameSnapshot3D["physics"]) {
    this.rapier = rapier;
    this.prepared = prepared;
    this.gravity = { ...scene.gravity };
    this.world = snapshot ? rapier.World.restoreSnapshot(base64ToBytes(snapshot.bytes)) : new rapier.World(scene.gravity);
    this.world.timestep = 1 / 60;
    try {
      for (const state of states) {
        if (snapshot) {
          const bodyHandle = snapshot.bodies[state.definition.id];
          const colliderHandle = snapshot.colliders[state.definition.id];
          const body = bodyHandle === undefined ? undefined : this.world.getRigidBody(bodyHandle);
          const collider = colliderHandle === undefined ? undefined : this.world.getCollider(colliderHandle);
          if (state.active && (state.definition.body3d && !body || state.definition.collider3d && !collider)) {
            throw new Error(`Physics snapshot is missing ${state.definition.id}`);
          }
          const controller = state.active ? this.createController(state) : undefined;
          this.records.set(state.definition.id, { body, collider, controller });
          if (collider) this.colliderEntities.set(collider.handle, state.definition.id);
        } else if (state.active) {
          this.add(state);
        }
      }
    } catch (error) {
      this.world.free();
      throw error;
    }
  }

  private createController(state: EntityState3D): KinematicCharacterController | undefined {
    const definition = state.definition.character3d;
    if (!definition) return undefined;
    const controller = this.world.createCharacterController(CONTROLLER_OFFSET);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setMaxSlopeClimbAngle(definition.slopeLimit * Math.PI / 180);
    controller.setMinSlopeSlideAngle(definition.slopeLimit * Math.PI / 180);
    if (definition.stepHeight > 0) controller.enableAutostep(definition.stepHeight, 0.1, false);
    if (definition.groundSnap > 0) controller.enableSnapToGround(definition.groundSnap);
    controller.setApplyImpulsesToDynamicBodies(true);
    controller.setCharacterMass(70);
    return controller;
  }

  private colliderDescription(definition: GameCollider3D): ColliderDesc {
    let description: ColliderDesc | null;
    switch (definition.kind) {
      case "box": description = this.rapier.ColliderDesc.cuboid(definition.halfExtents.x, definition.halfExtents.y, definition.halfExtents.z); break;
      case "sphere": description = this.rapier.ColliderDesc.ball(definition.radius); break;
      case "capsule": description = this.rapier.ColliderDesc.capsule(definition.halfHeight, definition.radius); break;
      case "convexHull": {
        const geometry = this.prepared.get(definition.assetId);
        if (!geometry) throw new Error(`Missing prepared collider ${definition.assetId}`);
        description = this.rapier.ColliderDesc.convexHull(geometry.vertices);
        break;
      }
      case "triangleMesh": {
        const geometry = this.prepared.get(definition.assetId);
        if (!geometry?.indices) throw new Error(`Missing prepared triangle collider ${definition.assetId}`);
        description = this.rapier.ColliderDesc.trimesh(geometry.vertices, geometry.indices);
        break;
      }
    }
    if (!description) throw new Error("Prepared convex collider is degenerate");
    return description.setTranslation(definition.offset.x, definition.offset.y, definition.offset.z)
      .setRotation(quaternionObject(definition.rotation)).setSensor(definition.sensor).setCollisionGroups(collisionGroups(definition))
      .setActiveCollisionTypes(this.rapier.ActiveCollisionTypes.DEFAULT | this.rapier.ActiveCollisionTypes.KINEMATIC_FIXED | this.rapier.ActiveCollisionTypes.KINEMATIC_KINEMATIC)
      .setFriction(definition.friction).setRestitution(definition.restitution);
  }

  add(state: EntityState3D): void {
    const definition = state.definition;
    const settings = definition.body3d;
    let body: RigidBody | undefined;
    if (settings || definition.collider3d) {
      const description = settings?.type === "dynamic" ? this.rapier.RigidBodyDesc.dynamic() : settings?.type === "kinematic" ?
        this.rapier.RigidBodyDesc.kinematicPositionBased() : this.rapier.RigidBodyDesc.fixed();
      description.setTranslation(state.transform.position.x, state.transform.position.y, state.transform.position.z)
        .setRotation(quaternionObject(state.transform.rotation));
      if (settings) {
        description.setLinvel(state.velocity.x, state.velocity.y, state.velocity.z).setAngvel(state.angularVelocity)
          .setGravityScale(settings.gravityScale).setLinearDamping(settings.linearDamping).setAngularDamping(settings.angularDamping).setCcdEnabled(settings.ccd);
      }
      if (definition.character3d) description.lockRotations();
      body = this.world.createRigidBody(description);
    }
    const collider = definition.collider3d ? this.world.createCollider(this.colliderDescription(definition.collider3d), body) : undefined;
    if (settings?.type === "dynamic" && collider) collider.setMass(settings.mass);
    if (collider) this.colliderEntities.set(collider.handle, definition.id);
    this.records.set(definition.id, { body, collider, controller: this.createController(state) });
  }

  remove(entityId: string): void {
    const record = this.records.get(entityId);
    if (!record) return;
    if (record.collider) this.colliderEntities.delete(record.collider.handle);
    if (record.controller) this.world.removeCharacterController(record.controller);
    if (record.body) this.world.removeRigidBody(record.body);
    else if (record.collider) this.world.removeCollider(record.collider, true);
    this.records.delete(entityId);
  }

  teleport(state: EntityState3D, command: Extract<GameScriptCommand3D, { kind: "teleport" }>): void {
    const record = this.records.get(state.definition.id);
    state.transform = { ...state.transform, position: { ...command.position }, rotation: command.rotation ?? state.transform.rotation };
    state.previousTransform = structuredClone(state.transform);
    if (record?.body) {
      record.body.setTranslation(command.position, true);
      record.body.setRotation(quaternionObject(state.transform.rotation), true);
      if (state.definition.body3d?.type === "kinematic") {
        record.body.setNextKinematicTranslation(command.position);
        record.body.setNextKinematicRotation(quaternionObject(state.transform.rotation));
      }
      if (command.resetVelocity) {
        record.body.setLinvel(ZERO3, true);
        record.body.setAngvel(ZERO3, true);
      }
    }
    if (command.resetVelocity) {
      state.velocity = { ...ZERO3 };
      state.angularVelocity = { ...ZERO3 };
    }
    if (state.controller) {
      state.controller = { grounded: false, coyoteRemaining: 0, jumpBufferRemaining: 0, verticalVelocity: command.resetVelocity ? 0 : state.velocity.y };
    }
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  setVelocity(state: EntityState3D, velocity: GameVector3): void {
    state.velocity = { ...velocity };
    this.records.get(state.definition.id)?.body?.setLinvel(velocity, true);
    if (state.controller) state.controller.verticalVelocity = velocity.y;
  }

  impulse(state: EntityState3D, impulse: GameVector3): void {
    if (state.definition.body3d?.type !== "dynamic") throw new Error(`Impulse requires a dynamic body (${state.definition.id})`);
    this.records.get(state.definition.id)?.body?.applyImpulse(impulse, true);
  }

  setKinematicPose(state: EntityState3D, command: Extract<GameScriptCommand3D, { kind: "setKinematicPose" }>): void {
    if (state.definition.body3d?.type !== "kinematic" || state.definition.character3d) throw new Error(`Kinematic pose requires a platform (${state.definition.id})`);
    const body = this.records.get(state.definition.id)?.body;
    if (!body) throw new Error(`Missing kinematic body ${state.definition.id}`);
    body.setNextKinematicTranslation(command.position);
    if (command.rotation) body.setNextKinematicRotation(quaternionObject(command.rotation));
  }

  private restoreReplayBoundary(states: readonly EntityState3D[]): void {
    // Rapier's serialized world omits transient traversal state, so every tick starts from its codec boundary.
    const previous = this.world;
    const next = this.rapier.World.restoreSnapshot(previous.takeSnapshot());
    const definitions = new Map(states.map((state) => [state.definition.id, state]));
    const records = new Map<string, BodyRecord3D>();
    this.world = next;
    try {
      for (const [entityId, record] of this.records) {
        const state = definitions.get(entityId);
        records.set(entityId, {
          body: record.body ? next.getRigidBody(record.body.handle) : undefined,
          collider: record.collider ? next.getCollider(record.collider.handle) : undefined,
          controller: state?.active ? this.createController(state) : undefined
        });
      }
    } catch (error) {
      next.free();
      this.world = previous;
      throw new Error("Physics replay boundary could not be reconstructed", { cause: error });
    }
    this.records.clear();
    for (const [entityId, record] of records) this.records.set(entityId, record);
    previous.free();
  }

  step(states: readonly EntityState3D[], input: GameInputFrame3D, yaw: number, intents: ReadonlyMap<string, { movement: GameVector3; jump: boolean }>, posed: ReadonlySet<string>): Contact3D[] {
    this.restoreReplayBoundary(states);
    const contacts = new Map<string, Contact3D>();
    const order = new Map(states.map((state, index) => [state.definition.id, index]));
    const observe = (entityId: string, otherId: string, sensor: boolean, normal: GameVector3, time: number): void => {
      if (entityId === otherId) return;
      const key = pairKey3D(entityId, otherId);
      const existing = contacts.get(key);
      if (!existing || time < existing.time) contacts.set(key, { entityId, otherId, sensor, normal: { ...normal }, time });
      if (contacts.size > MAX_SPATIAL_OBSERVATIONS) throw new Error("3D contact observation limit exceeded");
    };
    const platformMoves = new Map<string, GameVector3>();
    for (const state of states) {
      if (!state.active || state.definition.body3d?.type !== "kinematic" || state.definition.character3d) continue;
      const body = this.records.get(state.definition.id)?.body;
      if (!body) continue;
      const delta = posed.has(state.definition.id) ? add3(body.nextTranslation(), scale3(body.translation(), -1)) : scale3(state.velocity, 1 / 60);
      if (!posed.has(state.definition.id)) {
        body.setNextKinematicTranslation(add3(state.transform.position, delta));
        const angularSpeed = Math.hypot(state.angularVelocity.x, state.angularVelocity.y, state.angularVelocity.z);
        if (angularSpeed > 0) {
          const halfAngle = angularSpeed / 120;
          const axis = scale3(state.angularVelocity, Math.sin(halfAngle) / angularSpeed);
          body.setNextKinematicRotation(quaternionObject(multiplyQuaternion(
            [axis.x, axis.y, axis.z, Math.cos(halfAngle)], state.transform.rotation
          )));
        }
      }
      platformMoves.set(state.definition.id, delta);
    }
    const sensors = [...this.records.values()].flatMap((record) => record.collider?.isSensor() ? [record.collider] : []);
    let sensorCasts = 0;
    for (const state of states) {
      if (!state.active || !state.definition.character3d) continue;
      const record = this.records.get(state.definition.id);
      const character = state.definition.character3d;
      const controllerState = state.controller;
      if (!record?.controller || !record.body || !record.collider || !controllerState) throw new Error(`Incomplete character ${state.definition.id}`);
      const intent = intents.get(state.definition.id);
      let x = intent?.movement.x ?? input.axes[character.moveXAxis] ?? 0;
      let z = intent?.movement.z ?? input.axes[character.moveZAxis] ?? 0;
      const magnitude = Math.hypot(x, z);
      if (magnitude > 1) { x /= magnitude; z /= magnitude; }
      const worldX = x * Math.cos(yaw) + z * Math.sin(yaw);
      const worldZ = -x * Math.sin(yaw) + z * Math.cos(yaw);
      state.velocity.x = quantizeSpatial3D(approach(state.velocity.x, worldX * character.speed, character.acceleration / 60));
      state.velocity.z = quantizeSpatial3D(approach(state.velocity.z, worldZ * character.speed, character.acceleration / 60));
      if (controllerState.grounded) controllerState.coyoteRemaining = character.coyoteTicks;
      if (intent?.jump ?? input.justPressed.includes(character.jumpAction)) {
        controllerState.jumpBufferRemaining = character.jumpBufferTicks + 1;
      }
      let jumped = false;
      if (controllerState.jumpBufferRemaining > 0 && (controllerState.grounded || controllerState.coyoteRemaining > 0)) {
        controllerState.verticalVelocity = character.jumpSpeed;
        controllerState.jumpBufferRemaining = 0;
        controllerState.coyoteRemaining = 0;
        controllerState.grounded = false;
        jumped = true;
      }
      controllerState.verticalVelocity += this.gravity.y * (state.definition.body3d?.gravityScale ?? 1) / 60;
      const carry = !jumped && controllerState.supportId ? platformMoves.get(controllerState.supportId) ?? ZERO3 : ZERO3;
      const desired = add3({ x: state.velocity.x / 60, y: controllerState.verticalVelocity / 60, z: state.velocity.z / 60 }, carry);
      const previousSupportId = !jumped ? controllerState.supportId : undefined;
      const support = previousSupportId ? this.records.get(previousSupportId)?.collider : undefined;
      record.controller.computeColliderMovement(record.collider, desired, this.rapier.QueryFilterFlags.EXCLUDE_SENSORS, record.collider.collisionGroups(),
        (collider) => collider.handle !== support?.handle);

      const movement = record.controller.computedMovement();
      let supported = false;
      if (support && previousSupportId && controllerState.verticalVelocity <= 0 && state.definition.collider3d?.kind === "capsule") {
        const center = add3(add3(record.collider.translation(), movement), scale3(carry, -1));
        const height = state.definition.collider3d.halfHeight + state.definition.collider3d.radius;
        const ray = new this.rapier.Ray(center, { x: 0, y: -1, z: 0 });
        const hit = support.castRayAndGetNormal(ray, height + character.groundSnap + CONTROLLER_OFFSET, true);
        if (hit && hit.normal.y >= Math.cos(character.slopeLimit * Math.PI / 180) && hit.timeOfImpact > 0) {
          movement.y += height + CONTROLLER_OFFSET - hit.timeOfImpact;
          supported = true;
          observe(state.definition.id, previousSupportId, false, hit.normal, 0);
        }
      }
      const grounded = (record.controller.computedGrounded() || supported) && controllerState.verticalVelocity <= 0;
      controllerState.grounded = grounded;
      controllerState.supportId = supported ? previousSupportId : undefined;
      for (let index = 0; index < record.controller.numComputedCollisions(); index += 1) {
        const collision = record.controller.computedCollision(index);
        const otherId = collision?.collider ? this.colliderEntities.get(collision.collider.handle) : undefined;
        if (!collision || !otherId) continue;
        observe(state.definition.id, otherId, false, collision.normal1, collision.toi);
        if (grounded && collision.normal1.y > 0.5 && platformMoves.has(otherId)) controllerState.supportId = otherId;
      }
      if (grounded || movement.y < desired.y - 0.0001 && controllerState.verticalVelocity > 0) controllerState.verticalVelocity = 0;
      if (!grounded && controllerState.coyoteRemaining > 0) controllerState.coyoteRemaining -= 1;
      if (controllerState.jumpBufferRemaining > 0) controllerState.jumpBufferRemaining -= 1;
      state.velocity.y = controllerState.verticalVelocity;
      for (const sensor of sensors) {
        if (!compatible(record.collider, sensor)) continue;
        sensorCasts += 1;
        if (sensorCasts > MAX_SENSOR_CASTS) throw new Error("3D sensor query limit exceeded");
        const hit = sensor.castShape(ZERO3, record.collider.shape, record.collider.translation(), record.collider.rotation(), movement, 0, 1, true);
        const otherId = this.colliderEntities.get(sensor.handle);
        if (hit && otherId) observe(state.definition.id, otherId, true, hit.normal1, hit.time_of_impact);
      }
      record.body.setNextKinematicTranslation(add3(state.transform.position, movement));
    }
    this.world.step();
    for (const state of states) {
      if (!state.active) continue;
      const record = this.records.get(state.definition.id);
      if (record?.body) {
        state.transform = { ...state.transform, position: { ...record.body.translation() }, rotation: quaternionArray(record.body.rotation()) };
        if (!state.definition.character3d) state.velocity = { ...record.body.linvel() };
        state.angularVelocity = { ...record.body.angvel() };
      }
      if (!record?.collider) continue;
      this.world.contactPairsWith(record.collider, (other) => {
        const otherId = this.colliderEntities.get(other.handle);
        if (!otherId) return;
        this.world.contactPair(record.collider!, other, (manifold, flipped) => {
          if (manifold.numContacts() > 0) observe(state.definition.id, otherId, false, scale3(manifold.normal(), flipped ? 1 : -1), 1);
        });
      });
      this.world.intersectionPairsWith(record.collider, (other) => {
        const otherId = this.colliderEntities.get(other.handle);
        if (otherId && this.world.intersectionPair(record.collider!, other)) observe(state.definition.id, otherId, true, ZERO3, 1);
      });
    }
    return [...contacts.values()].sort((a, b) => a.time - b.time || (order.get(a.entityId) ?? 0) - (order.get(b.entityId) ?? 0) || (order.get(a.otherId) ?? 0) - (order.get(b.otherId) ?? 0));
  }

  rayQuery(origin: GameVector3, direction: GameVector3, maxDistance: number, mask: number, excludeId?: string): { entityId: string; position: GameVector3; normal: GameVector3; distance: number } | undefined {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length === 0) throw new Error("Ray query direction must be nonzero");
    const ray = new this.rapier.Ray(origin, scale3(direction, 1 / length));
    let nearest: { entityId: string; position: GameVector3; normal: GameVector3; distance: number } | undefined;
    for (const [entityId, record] of this.records) {
      if (entityId === excludeId || !record.collider || record.collider.isSensor() || ((record.collider.collisionGroups() >>> 16) & mask) === 0) continue;
      const hit = record.collider.castRayAndGetNormal(ray, maxDistance, true);
      if (hit && (!nearest || hit.timeOfImpact < nearest.distance)) nearest = { entityId, position: ray.pointAt(hit.timeOfImpact), normal: { ...hit.normal }, distance: hit.timeOfImpact };
    }
    return nearest;
  }

  shapeQuery(command: Extract<GameScriptCommand3D, { kind: "shapeQuery" }>, excludeId?: string): {
    readonly hits: { readonly entityId: string; readonly position: GameVector3 }[];
    readonly truncated: boolean;
  } {
    const description = command.shape;
    const shape = description.kind === "sphere" ? new this.rapier.Ball(description.radius) : description.kind === "box" ?
      new this.rapier.Cuboid(description.halfExtents.x, description.halfExtents.y, description.halfExtents.z) :
      new this.rapier.Capsule(description.halfHeight, description.radius);
    const hits: { entityId: string; position: GameVector3 }[] = [];
    for (const [entityId, record] of this.records) {
      const collider = record.collider;
      if (entityId === excludeId || !collider || !command.includeSensors && collider.isSensor() || ((collider.collisionGroups() >>> 16) & command.mask) === 0) continue;
      if (!collider.intersectsShape(shape, command.position, quaternionObject(command.rotation))) continue;
      if (hits.length === command.maximumResults) return { hits, truncated: true };
      hits.push({ entityId, position: { ...collider.translation() } });
    }
    return { hits, truncated: false };
  }

  cameraDistance(origin: GameVector3, direction: GameVector3, radius: number, excludeId: string): number {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length === 0) return 0;
    let fraction = 1;
    const sphere = new this.rapier.Ball(radius);
    for (const [entityId, record] of this.records) {
      if (entityId === excludeId || !record.collider || record.collider.isSensor()) continue;
      const hit = record.collider.castShape(ZERO3, sphere, origin, quaternionObject([0, 0, 0, 1]), direction, 0, 1, true);
      if (hit) fraction = Math.min(fraction, Math.max(0, hit.time_of_impact - CONTROLLER_OFFSET / length));
    }
    return fraction;
  }

  snapshot(): GameSnapshot3D["physics"] {
    return { encoding: "base64", bytes: bytesToBase64(this.world.takeSnapshot()),
      bodies: Object.fromEntries([...this.records].flatMap(([id, record]) => record.body ? [[id, record.body.handle]] : [])),
      colliders: Object.fromEntries([...this.records].flatMap(([id, record]) => record.collider ? [[id, record.collider.handle]] : [])) };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.world.free();
    this.records.clear();
    this.colliderEntities.clear();
  }
}
