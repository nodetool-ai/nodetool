import type { Collider, ColliderDesc, KinematicCharacterController, RayIntersection, RigidBody, World } from "@dimforge/rapier3d-compat";
import { IS_NODE, importOptionalModule } from "@nodetool-ai/config";
import { missingRuntimePackageError } from "@nodetool-ai/protocol";
import type { GameQuaternion3D, GameCollider3D, GameInputFrame3D, GameScene3D, GameScriptCommand3D, GameSnapshot3D, GameVector3 } from "@nodetool-ai/protocol";
import { add3, approach, multiplyQuaternion, quaternionArray, quaternionObject, quantizeSpatial3D, rotate3, scale3, ZERO3 } from "./math.js";
import { base64ToBytes, bytesToBase64 } from "./digest.js";
import { pairKey3D, type Contact3D, type EntityState3D } from "./state.js";

export const GAME_PHYSICS_BUILD_3D = "rapier3d-compat@0.19.3:sha256:1ce1c8c4036b4dcd3bde86c6efdb0f270cf5e274979b1de6ab8052947ef166c5:runtime-2";
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
  if (!preparedRapier) {
    const attempt = import("@dimforge/rapier3d-compat").catch(async (cause: unknown) => {
      if (cause instanceof Error && "code" in cause &&
          (cause.code === "ERR_MODULE_NOT_FOUND" || cause.code === "MODULE_NOT_FOUND") &&
          /Cannot find (?:package|module) ['"]@dimforge\/rapier3d-compat['"]/.test(cause.message)) {
        if (IS_NODE) {
          try {
            return await importOptionalModule<typeof import("@dimforge/rapier3d-compat")>("@dimforge/rapier3d-compat");
          } catch (fallbackCause) {
            throw missingRuntimePackageError("@dimforge/rapier3d-compat", "rapier", fallbackCause);
          }
        }
        throw missingRuntimePackageError("@dimforge/rapier3d-compat", "rapier", cause);
      }
      throw cause;
    }).then(async (module) => {
      await module.default.init();
      return module.default;
    });
    preparedRapier = attempt;
    attempt.catch(() => {
      if (preparedRapier === attempt) { preparedRapier = undefined; }
    });
  }
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

function assertCharacterRotation3D(state: EntityState3D, rotation: GameQuaternion3D): void {
  if (state.definition.character3d && (rotation[0] !== 0 || rotation[2] !== 0)) {
    throw new Error(`Character capsule ${state.definition.id} must remain upright`);
  }
}

interface BodyRecord3D {
  readonly body?: RigidBody;
  readonly collider?: Collider;
  readonly controller?: KinematicCharacterController;
}

interface KinematicMotion3D {
  readonly position: GameVector3;
  readonly nextPosition: GameVector3;
  readonly rotation: GameQuaternion3D;
  readonly inverseRotation: GameQuaternion3D;
}

function inverseQuaternion3D(rotation: GameQuaternion3D): GameQuaternion3D {
  return [-rotation[0], -rotation[1], -rotation[2], rotation[3]];
}

function movedPoint3D(motion: KinematicMotion3D, point: GameVector3): GameVector3 {
  return add3(motion.nextPosition, rotate3(add3(point, scale3(motion.position, -1)), motion.rotation));
}

function previousPoint3D(motion: KinematicMotion3D, point: GameVector3): GameVector3 {
  return add3(motion.position, rotate3(add3(point, scale3(motion.nextPosition, -1)), motion.inverseRotation));
}

export interface SpatialStep3D {
  readonly contacts: Map<string, Contact3D>;
  readonly order: ReadonlyMap<string, number>;
  readonly observe: (entityId: string, otherId: string, sensor: boolean, normal: GameVector3, time: number) => void;
}

export class SpatialWorld3D {
  readonly rapier: Rapier;
  world: World;
  private readonly gravity: GameVector3;
  private readonly records = new Map<string, BodyRecord3D>();
  private readonly colliderEntities = new Map<number, string>();
  private readonly prepared: ReadonlyMap<string, PreparedCollider3D>;
  private disposed = false;
  private readonly loadedBodies = new Set<string>();

  constructor(rapier: Rapier, scene: GameScene3D, states: readonly EntityState3D[], prepared: ReadonlyMap<string, PreparedCollider3D>, snapshot?: GameSnapshot3D["physics"]) {
    this.rapier = rapier;
    this.prepared = prepared;
    this.gravity = { ...scene.gravity };
    for (const state of states) {
      assertCharacterRotation3D(state, state.transform.rotation);
      assertCharacterRotation3D(state, state.previousTransform.rotation);
      assertCharacterRotation3D(state, state.localTransform.rotation);
    }
    this.world = snapshot ? rapier.World.restoreSnapshot(base64ToBytes(snapshot.bytes)) : new rapier.World(scene.gravity);
    this.world.timestep = 1 / 60;
    try {
      if (snapshot) { this.validateSnapshotOwnership(states, snapshot); }
      for (const state of states) {
        if (snapshot) {
          const bodyHandle = Object.hasOwn(snapshot.bodies, state.definition.id) ? snapshot.bodies[state.definition.id] : undefined;
          const colliderHandle = Object.hasOwn(snapshot.colliders, state.definition.id) ? snapshot.colliders[state.definition.id] : undefined;
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

  private validateSnapshotOwnership(states: readonly EntityState3D[], snapshot: GameSnapshot3D["physics"]): void {
    const bodies = states.filter((state) => state.active && (state.definition.body3d || state.definition.collider3d));
    const colliders = states.filter((state) => state.active && state.definition.collider3d);
    const validMap = (mapping: Readonly<Record<string, number>>, expected: readonly EntityState3D[], count: number): boolean => {
      const keys = Object.keys(mapping);
      return keys.length === expected.length && count === expected.length &&
        new Set(Object.values(mapping)).size === keys.length && expected.every((state) => Object.hasOwn(mapping, state.definition.id));
    };
    if (!validMap(snapshot.bodies, bodies, this.world.bodies.len()) ||
        !validMap(snapshot.colliders, colliders, this.world.colliders.len())) {
      throw new Error("Physics snapshot entity handles do not match the active scene");
    }
    const sameVector = (actual: GameVector3, expected: GameVector3): boolean =>
      actual.x === Math.fround(expected.x) && actual.y === Math.fround(expected.y) && actual.z === Math.fround(expected.z);
    const sameRotation = (actual: { x: number; y: number; z: number; w: number }, expected: GameQuaternion3D): boolean =>
      actual.x === Math.fround(expected[0]) && actual.y === Math.fround(expected[1]) &&
      actual.z === Math.fround(expected[2]) && actual.w === Math.fround(expected[3]);
    const shapeTypes = { box: this.rapier.ShapeType.Cuboid, sphere: this.rapier.ShapeType.Ball,
      capsule: this.rapier.ShapeType.Capsule, convexHull: this.rapier.ShapeType.ConvexPolyhedron,
      triangleMesh: this.rapier.ShapeType.TriMesh } as const;
    for (const state of bodies) {
      const id = state.definition.id;
      const bodyHandle = snapshot.bodies[id];
      if (bodyHandle === undefined) { throw new Error(`Physics snapshot body is missing ${id}`); }
      const body = this.world.getRigidBody(bodyHandle);
      const kind = state.definition.body3d?.type;
      const expectedType = kind === "dynamic" ? this.rapier.RigidBodyType.Dynamic : kind === "kinematic" ?
        this.rapier.RigidBodyType.KinematicPositionBased : this.rapier.RigidBodyType.Fixed;
      const rotation = body?.rotation();
      if (!body || body.bodyType() !== expectedType || !sameVector(body.translation(), state.transform.position) ||
          !rotation || !sameRotation(rotation, state.transform.rotation) ||
          (!state.definition.character3d && (!sameVector(body.linvel(), state.velocity) || !sameVector(body.angvel(), state.angularVelocity)))) {
        throw new Error(`Physics snapshot body does not match ${id}`);
      }
      const definition = state.definition.collider3d;
      if (definition) {
        const colliderHandle = snapshot.colliders[id];
        if (colliderHandle === undefined) { throw new Error(`Physics snapshot collider is missing ${id}`); }
        const collider = this.world.getCollider(colliderHandle);
        const offset = collider?.translationWrtParent();
        const localRotation = collider?.rotationWrtParent();
        if (!collider || collider.parent()?.handle !== body.handle || collider.isSensor() !== definition.sensor ||
            collider.collisionGroups() !== collisionGroups(definition) || collider.shape.type !== shapeTypes[definition.kind] ||
            !offset || !sameVector(offset, definition.offset) || !localRotation ||
            !sameRotation(localRotation, definition.rotation) ||
            (definition.kind === "box" && !sameVector(collider.halfExtents(), definition.halfExtents)) ||
            ((definition.kind === "sphere" || definition.kind === "capsule") && collider.radius() !== Math.fround(definition.radius)) ||
            (definition.kind === "capsule" && collider.halfHeight() !== Math.fround(definition.halfHeight))) {
          throw new Error(`Physics snapshot collider does not match ${id}`);
        }
      }
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
    // An unset rule keeps Rapier's default, average, so colliders without one build exactly as before.
    const rules = this.rapier.CoefficientCombineRule;
    const rule = { average: rules.Average, min: rules.Min, multiply: rules.Multiply, max: rules.Max } as const;
    if (definition.frictionCombine) description.setFrictionCombineRule(rule[definition.frictionCombine]);
    if (definition.restitutionCombine) description.setRestitutionCombineRule(rule[definition.restitutionCombine]);
    return description.setTranslation(definition.offset.x, definition.offset.y, definition.offset.z)
      .setRotation(quaternionObject(definition.rotation)).setSensor(definition.sensor).setCollisionGroups(collisionGroups(definition))
      .setActiveCollisionTypes(this.rapier.ActiveCollisionTypes.DEFAULT | this.rapier.ActiveCollisionTypes.KINEMATIC_FIXED | this.rapier.ActiveCollisionTypes.KINEMATIC_KINEMATIC)
      .setFriction(definition.friction).setRestitution(definition.restitution);
  }

  add(state: EntityState3D): void {
    assertCharacterRotation3D(state, state.transform.rotation);
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
      if (settings?.type === "dynamic" && !definition.collider3d) { description.setAdditionalMass(settings.mass); }
      if (definition.character3d) description.lockRotations();
      body = this.world.createRigidBody(description);
    }
    let collider: Collider | undefined;
    if (definition.collider3d) {
      const description = this.colliderDescription(definition.collider3d);
      if (settings?.type === "dynamic") { description.setMass(settings.mass); }
      collider = this.world.createCollider(description, body);
    }
    if (collider) this.colliderEntities.set(collider.handle, definition.id);
    this.records.set(definition.id, { body, collider, controller: this.createController(state) });
  }

  remove(entityId: string): void {
    this.loadedBodies.delete(entityId);
    const record = this.records.get(entityId);
    if (!record) return;
    if (record.collider) this.colliderEntities.delete(record.collider.handle);
    if (record.controller) this.world.removeCharacterController(record.controller);
    if (record.body) this.world.removeRigidBody(record.body);
    else if (record.collider) this.world.removeCollider(record.collider, true);
    this.records.delete(entityId);
  }

  teleport(state: EntityState3D, command: Extract<GameScriptCommand3D, { kind: "teleport" }>): void {
    assertCharacterRotation3D(state, command.rotation ?? state.transform.rotation);
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

  private forceBody(state: EntityState3D): RigidBody {
    if (!state.active || state.definition.body3d?.type !== "dynamic") {
      throw new Error(`Force requires an active dynamic body (${state.definition.id})`);
    }
    const body = this.records.get(state.definition.id)?.body;
    if (!body) { throw new Error(`Force body missing (${state.definition.id})`); }
    return body;
  }

  addForce(state: EntityState3D, force: GameVector3): void {
    const body = this.forceBody(state);
    if (force.x === 0 && force.y === 0 && force.z === 0) { return; }
    body.addForce(force, true);
    this.loadedBodies.add(state.definition.id);
  }

  addTorque(state: EntityState3D, torque: GameVector3): void {
    const body = this.forceBody(state);
    if (torque.x === 0 && torque.y === 0 && torque.z === 0) { return; }
    body.addTorque(torque, true);
    this.loadedBodies.add(state.definition.id);
  }

  addForceAtPoint(state: EntityState3D, force: GameVector3, point: GameVector3): void {
    const body = this.forceBody(state);
    if (force.x === 0 && force.y === 0 && force.z === 0) { return; }
    body.addForceAtPoint(force, point, true);
    this.loadedBodies.add(state.definition.id);
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

  prepareCharacters(states: readonly EntityState3D[], input: GameInputFrame3D, yaw: number, intents: ReadonlyMap<string, { movement: GameVector3; jump: boolean }>, posed: ReadonlySet<string>): SpatialStep3D {
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
    const platformMoves = new Map<string, KinematicMotion3D>();
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
      const rotation = multiplyQuaternion(quaternionArray(body.nextRotation()), inverseQuaternion3D(quaternionArray(body.rotation())));
      platformMoves.set(state.definition.id, { position: { ...body.translation() }, nextPosition: { ...body.nextTranslation() },
        rotation, inverseRotation: inverseQuaternion3D(rotation) });
    }
    const sensors = [...this.records.entries()].flatMap(([id, record]) => {
      const collider = record.collider;
      if (!collider?.isSensor()) { return []; }
      const motion = platformMoves.get(id);
      const position = collider.translation();
      const movement = motion ? add3(movedPoint3D(motion, position), scale3(position, -1)) : ZERO3;
      return [{ collider, movement }];
    });
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
      const supportMotion = !jumped && controllerState.supportId ? platformMoves.get(controllerState.supportId) : undefined;
      const center = record.collider.translation();
      const carry = supportMotion ? add3(movedPoint3D(supportMotion, center), scale3(center, -1)) : ZERO3;
      const desired = add3({ x: state.velocity.x / 60, y: controllerState.verticalVelocity / 60, z: state.velocity.z / 60 }, carry);
      const previousSupportId = !jumped ? controllerState.supportId : undefined;
      const support = previousSupportId ? this.records.get(previousSupportId)?.collider : undefined;
      const characterCollider = record.collider;
      const supportHeight = state.definition.collider3d?.kind === "capsule"
        ? state.definition.collider3d.halfHeight + state.definition.collider3d.radius : undefined;
      const supportHit = (movement: GameVector3): RayIntersection | undefined => {
        if (!support || supportHeight === undefined || controllerState.verticalVelocity > 0) { return undefined; }
        const candidate = add3(characterCollider.translation(), movement);
        const origin = supportMotion ? previousPoint3D(supportMotion, candidate) : candidate;
        const down = supportMotion ? rotate3({ x: 0, y: -1, z: 0 }, supportMotion.inverseRotation) : { x: 0, y: -1, z: 0 };
        const ray = new this.rapier.Ray(origin, down);
        const hit = support.castRayAndGetNormal(ray, supportHeight + character.groundSnap + CONTROLLER_OFFSET, true);
        if (!hit || hit.timeOfImpact <= 0) { return undefined; }
        if (supportMotion) { hit.normal = rotate3(hit.normal, supportMotion.rotation); }
        return hit.normal.y >= Math.cos(character.slopeLimit * Math.PI / 180) ? hit : undefined;
      };
      const requestedSupport = supportHit(desired);
      if (requestedSupport && supportHeight !== undefined) {
        desired.y += supportHeight + CONTROLLER_OFFSET - requestedSupport.timeOfImpact;
      }
      record.controller.computeColliderMovement(record.collider, desired, this.rapier.QueryFilterFlags.EXCLUDE_SENSORS, record.collider.collisionGroups(),
        (collider) => collider.handle !== support?.handle);
      const movement = record.controller.computedMovement();
      const resolvedSupport = supportHit(movement);
      const supported = resolvedSupport !== undefined && supportHeight !== undefined &&
        resolvedSupport.timeOfImpact >= supportHeight - 0.00001;
      if (supported && previousSupportId) {
        observe(state.definition.id, previousSupportId, false, resolvedSupport.normal, 0);
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
      for (const { collider: sensor, movement: sensorMovement } of sensors) {
        if (!compatible(record.collider, sensor)) continue;
        sensorCasts += 1;
        if (sensorCasts > MAX_SENSOR_CASTS) throw new Error("3D sensor query limit exceeded");
        const hit = sensor.castShape(sensorMovement, record.collider.shape, record.collider.translation(), record.collider.rotation(), movement, 0, 1, true);
        const otherId = this.colliderEntities.get(sensor.handle);
        if (hit && otherId) observe(state.definition.id, otherId, true, hit.normal1, hit.time_of_impact);
      }
      record.body.setNextKinematicTranslation(add3(state.transform.position, movement));
    }
    return { contacts, order, observe };
  }

  stepPhysics(): void {
    this.world.step();
    // Rapier retains user loads. Clear only this tick's loaded bodies before snapshotting.
    for (const id of this.loadedBodies) {
      const body = this.records.get(id)?.body;
      body?.resetForces(false);
      body?.resetTorques(false);
    }
    this.loadedBodies.clear();
  }

  collectContacts(states: readonly EntityState3D[], step: SpatialStep3D): Contact3D[] {
    const { contacts, order, observe } = step;
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

  step(states: readonly EntityState3D[], input: GameInputFrame3D, yaw: number, intents: ReadonlyMap<string, { movement: GameVector3; jump: boolean }>, posed: ReadonlySet<string>): Contact3D[] {
    const prepared = this.prepareCharacters(states, input, yaw, intents, posed);
    this.stepPhysics();
    return this.collectContacts(states, prepared);
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
    this.loadedBodies.clear();
    this.colliderEntities.clear();
  }
}
