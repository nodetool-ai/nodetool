"""Shared render-op setup: import, camera, lights, world, engine.

Factored out of `render_image.py` so `render_passes` and `render_animation`
run the same scene setup (D5). Behavior is unchanged: factory settings with
`use_empty=True`, glTF import, then the camera `camera_mode` selects (D4).
Lights come from the scene when it has any, else the `lighting` preset.

`setup_render_scene(job, workdir)` runs the full setup and returns
`(scene, meshes, center, radius, camera_obj)`. Ops that need per-frame work
(render_animation's orbit sweep) use the smaller pieces directly.
"""

import math
import os

import bpy
from mathutils import Vector

from errors import BadJob, ImportFailed, NoCamera, NoGeometry, RenderFailed
from framing import compute_framing, orbit_offset


ORBIT_CAMERA_NAME = "NodeTool_Orbit"

CYCLES_SEED = 0


def _hex_to_rgb(value):
    text = value.strip().lstrip("#")
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    if len(text) != 6:
        raise BadJob("background_color %r is not a hex color" % (value,))
    try:
        channels = [int(text[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    except ValueError:
        raise BadJob("background_color %r is not a hex color" % (value,))
    return tuple(channels) + (1.0,)


def mesh_objects(scene):
    return [
        obj
        for obj in scene.objects
        if obj.type == "MESH" and len(obj.data.polygons) > 0
    ]


def ensure_materials(meshes):
    """Give material-less meshes a neutral white material.

    The three.js preview renders mesh data with a default material when the
    glTF carries none; EEVEE/Cycles leave those faces unlit (effectively
    invisible), so the op does the same fallback before any render time.
    """
    fallback = None
    for obj in meshes:
        slots = obj.material_slots
        if slots and all(slot.material is not None for slot in slots):
            continue
        if fallback is None:
            fallback = bpy.data.materials.new("NodeTool_Default")
            fallback.use_nodes = True
            principled = fallback.node_tree.nodes.get("Principled BSDF")
            if principled is not None:
                principled.inputs["Base Color"].default_value = (0.9, 0.9, 0.9, 1.0)
                principled.inputs["Roughness"].default_value = 0.8
        if not slots:
            obj.data.materials.append(fallback)
        else:
            for slot in slots:
                if slot.material is None:
                    slot.material = fallback


def scene_bounds(meshes):
    corners = []
    for obj in meshes:
        for corner in obj.bound_box:
            corners.append(obj.matrix_world @ Vector(corner))
    if not corners:
        raise NoGeometry("the model contains no visible geometry")
    lo = Vector(
        (
            min(c.x for c in corners),
            min(c.y for c in corners),
            min(c.z for c in corners),
        )
    )
    hi = Vector(
        (
            max(c.x for c in corners),
            max(c.y for c in corners),
            max(c.z for c in corners),
        )
    )
    center = (lo + hi) / 2
    radius = max((c - center).length for c in corners)
    return center, radius


def scene_cameras(scene):
    return sorted(
        (obj for obj in scene.objects if obj.type == "CAMERA"),
        key=lambda obj: obj.name,
    )


def orbit_location(center, radius, params, aspect):
    """World-space location of the orbit camera for the current props."""
    framing = compute_framing(radius, params["fov"], aspect, params["zoom"])
    offset = orbit_offset(params["azimuth"], params["elevation"], framing["distance"])
    # Rigid three.js (Y up) to Blender (Z up) rotation: (x, y, z) -> (x, -z, y).
    # Up stays up, azimuth 0 sits on -Y; see the framing module docstring.
    return center + Vector((offset["x"], -offset["z"], offset["y"])), framing


def make_orbit_camera(scene, center, radius, params, aspect):
    location, framing = orbit_location(center, radius, params, aspect)
    data = bpy.data.cameras.new(ORBIT_CAMERA_NAME)
    data.angle = math.radians(params["fov"])
    data.sensor_fit = "VERTICAL"
    data.clip_start = framing["near"]
    data.clip_end = framing["far"]
    obj = bpy.data.objects.new(ORBIT_CAMERA_NAME, data)
    scene.collection.objects.link(obj)
    obj.location = location
    aim_camera(obj, center)
    return obj


def aim_camera(obj, center):
    direction = center - obj.location
    if direction.length < 1e-9:
        raise RenderFailed("orbit camera coincides with the scene center")
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def select_camera(scene, center, radius, params, aspect):
    mode = params.get("camera_mode", "auto")
    if mode == "orbit":
        return make_orbit_camera(scene, center, radius, params, aspect)
    cameras = scene_cameras(scene)
    if mode == "scene":
        if not cameras:
            raise NoCamera(
                "camera_mode is 'scene' but the model has no camera; "
                "use 'auto' or 'orbit' instead"
            )
        return cameras[0]
    if mode == "auto":
        if cameras:
            return cameras[0]
        return make_orbit_camera(scene, center, radius, params, aspect)
    raise BadJob("unknown camera_mode %r" % (mode,))


def has_scene_lights(scene):
    return any(obj.type == "LIGHT" for obj in scene.objects)


def scene_animations(scene):
    """Objects carrying an imported glTF animation action."""
    found = []
    for obj in scene.objects:
        anim = obj.animation_data
        if anim is not None and anim.action is not None:
            found.append(obj)
    return found


def _add_sun(name, direction, energy):
    # `direction` points from the scene toward the light (camera side, like
    # the three.js key/fill/rim offsets). A sun's rays travel along its
    # local -Z, so +Z aligns with `direction` and the rays fly back into the
    # scene, lighting the faces the camera sees.
    data = bpy.data.lights.new(name, "SUN")
    data.energy = energy
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj


def apply_lighting_preset(scene, camera_obj, center, params):
    """Camera-relative key/fill/rim suns mirroring `addLights` in three.js."""
    to_camera = (camera_obj.location - center).normalized()
    up = Vector((0, 0, 1))
    side = up.cross(to_camera)
    if side.length < 1e-6:
        side = Vector((1, 0, 0))
    side = side.normalized()
    intensity = params["light_intensity"]
    preset = params["lighting"]

    def place(name, color, energy, direction):
        light = _add_sun(name, direction, energy * intensity)
        light.data.color = color
        return light

    if preset == "studio":
        key = to_camera + side * 0.8 + up * 0.9
        fill = to_camera - side * 1.1 + up * 0.2
        rim = -to_camera + up * 1.2
        place("NodeTool_Key", (1, 1, 1), 3.0, key.normalized())
        place("NodeTool_Fill", (1, 1, 1), 1.0, fill.normalized())
        place("NodeTool_Rim", (1, 1, 1), 2.0, rim.normalized())
    elif preset == "soft":
        place("NodeTool_Key", (1, 1, 1), 1.5, (to_camera + up).normalized())
    elif preset == "flat":
        pass
    else:
        raise BadJob("unknown lighting preset %r" % (preset,))


def apply_world(background_color, transparent):
    world = bpy.data.worlds.new("NodeTool_World")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is not None:
        background.inputs["Color"].default_value = _hex_to_rgb(background_color)
        background.inputs["Strength"].default_value = 1.0
    bpy.context.scene.world = world
    bpy.context.scene.render.film_transparent = bool(transparent)
    # `Standard` keeps the background color literal: the default filmic-style
    # transform would render #ffffff as mid gray.
    bpy.context.scene.view_settings.view_transform = "Standard"


def apply_engine(params):
    engine = params["engine"]
    scene = bpy.context.scene
    if engine == "eevee":
        scene.render.engine = "BLENDER_EEVEE"
        scene.eevee.taa_render_samples = max(1, int(params["samples"]))
    elif engine == "cycles":
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = max(1, int(params["samples"]))
        scene.cycles.use_denoising = bool(params["denoise"])
        scene.cycles.seed = CYCLES_SEED
    else:
        raise BadJob("unknown engine %r" % (engine,))


def apply_resolution(params):
    scene = bpy.context.scene
    width = max(1, int(params["width"]))
    height = max(1, int(params["height"]))
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = max(1, int(params["resolution_percentage"]))
    return width, height


def import_model(job, workdir, fps=None):
    """Factory reset, glTF import, and the `no_geometry` gate.

    `fps` is applied before the import when given: the importer maps a glTF
    animation channel timestamp `t` seconds onto frame `round(t * fps)` (D4),
    so the scene fps must already hold at import time.
    """
    model_path = os.path.join(workdir, job["inputs"]["model"])
    if not os.path.exists(model_path):
        raise BadJob("model input %r is missing" % (job["inputs"]["model"],))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    if fps is not None:
        bpy.context.scene.render.fps = max(1, int(fps))

    try:
        result = bpy.ops.import_scene.gltf(filepath=model_path)
    except Exception as exc:
        raise ImportFailed("glTF import failed: %s" % (exc,))
    if "FINISHED" not in result:
        raise ImportFailed("glTF importer rejected %r" % (job["inputs"]["model"],))

    scene = bpy.context.scene
    meshes = mesh_objects(scene)
    if not meshes:
        raise NoGeometry("the model contains no visible geometry")
    ensure_materials(meshes)
    return scene, meshes


def setup_render_scene(job, workdir, fps=None):
    """Full still-style setup. Returns `(scene, meshes, center, radius, camera)`."""
    params = job["job"]["params"]
    scene, meshes = import_model(job, workdir, fps=fps)
    width, height = apply_resolution(params)
    aspect = width / height
    center, radius = scene_bounds(meshes)
    camera_obj = select_camera(scene, center, radius, params, aspect)
    scene.camera = camera_obj
    if not has_scene_lights(scene):
        apply_lighting_preset(scene, camera_obj, center, params)
    apply_world(params["background_color"], params["transparent"])
    apply_engine(params)
    return scene, meshes, center, radius, camera_obj
