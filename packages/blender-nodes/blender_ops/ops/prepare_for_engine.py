"""The `prepare_for_engine` op: decimate, unwrap, bake, and export GLBs.

Pipeline over the imported glTF scene: every mesh is decimated toward
`target_faces`, optionally UV-unwrapped (`smart_project`), optionally baked
(`ao`, `normal`, or both) into the materials at `bake_resolution`, then the
prepared model is exported as GLB along with `lod_count` LODs at halving
face targets (`target/2`, `target/4`, ...). Every output is a GLB the glTF
exporter wrote, so `validateModel3D` reads them back.

Baking runs on Cycles (the bake operator's engine) with low samples; no
render happens, so the still/animation engine params do not exist here.
"""

import os
import time

import bpy

from errors import BadJob, ExportFailed, RenderFailed
from ops.common import import_model


def _face_count(meshes):
    return sum(len(obj.data.polygons) for obj in meshes)


def _set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def _decimate(meshes, target_faces):
    """Collapse every mesh toward the face target. Skips when already under."""
    for obj in meshes:
        faces = len(obj.data.polygons)
        if faces == 0:
            continue
        ratio = target_faces / faces
        if ratio >= 1.0:
            continue
        _set_active(obj)
        modifier = obj.modifiers.new("NodeTool_Decimate", "DECIMATE")
        modifier.ratio = max(ratio, 1.0 / faces)
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except Exception as exc:
            raise RenderFailed(
                "decimate failed on %r: %s" % (obj.name, exc)
            )


def _smart_project(obj):
    _set_active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=66, island_margin=0.02)
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")


def _unwrap(meshes):
    for obj in meshes:
        _smart_project(obj)


def _has_uvs(obj):
    return len(obj.data.uv_layers) > 0


def _principled(material):
    for node in material.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            return node
    return None


def _unique_materials(obj):
    """Every material on the object's slots, once each, in slot order."""
    materials = []
    for slot in obj.material_slots:
        if slot.material is not None and slot.material not in materials:
            materials.append(slot.material)
    return materials


def _bake_image(meshes, bake, bake_resolution):
    """One bake image per material per kind. Materials go single-user first
    so two meshes never share one image node. Every material gets its own
    selected image node: wiring only the active material leaves the other
    slots without a bake target, and the mesh exports half-baked (measured
    on 5.2.1: the bake succeeds but only the wired material carries a map).
    Returns `images[kind][obj.name]`, a list of `(material, image)` pairs."""
    images = {}
    for obj in meshes:
        for slot in obj.material_slots:
            if slot.material is not None:
                slot.material = slot.material.copy()
        materials = _unique_materials(obj)
        if not materials:
            raise RenderFailed(
                "cannot bake: %r has no material" % (obj.name,)
            )
        kinds = ("ao", "normal") if bake == "both" else (bake,)
        for material in materials:
            if not material.use_nodes:
                raise RenderFailed(
                    "cannot bake: material %r on %r has no nodes"
                    % (material.name, obj.name)
                )
            for kind in kinds:
                image = bpy.data.images.new(
                    "NodeTool_Bake_%s_%s_%s" % (kind, obj.name, material.name),
                    width=bake_resolution,
                    height=bake_resolution,
                )
                nodes = material.node_tree.nodes
                tex = nodes.new("ShaderNodeTexImage")
                tex.image = image
                # The bake operator writes the selected image nodes.
                for node in nodes:
                    node.select = node is tex
                nodes.active = tex
                images.setdefault(kind, {}).setdefault(obj.name, []).append(
                    (material, image)
                )
    return images


def _image_for(pairs, material):
    for candidate, image in pairs:
        if candidate is material:
            return image
    return None


def _wire_baked(meshes, images):
    """Normal maps ride a Normal Map node into Principled; AO multiplies
    into Base Color. Both shapes are ones the glTF exporter reads. Every
    material is wired, not just the active one: `_bake_image` bakes one
    image per material, and an unwired one would export without its bake."""
    for obj in meshes:
        for material in _unique_materials(obj):
            nodes = material.node_tree.nodes
            links = material.node_tree.links
            principled = _principled(material)
            if principled is None:
                continue
            if "normal" in images:
                baked = _image_for(images["normal"].get(obj.name, []), material)
                tex = next(
                    (
                        node
                        for node in nodes
                        if node.type == "TEX_IMAGE" and node.image is baked
                    ),
                    None,
                )
                if tex is not None:
                    normal_map = nodes.new("ShaderNodeNormalMap")
                    normal_map.space = "TANGENT"
                    links.new(tex.outputs["Color"], normal_map.inputs["Color"])
                    normal_socket = principled.inputs.get("Normal")
                    if normal_socket is not None:
                        links.new(normal_map.outputs["Normal"], normal_socket)
            if "ao" in images:
                baked = _image_for(images["ao"].get(obj.name, []), material)
                tex = next(
                    (
                        node
                        for node in nodes
                        if node.type == "TEX_IMAGE" and node.image is baked
                    ),
                    None,
                )
                if tex is not None:
                    base = principled.inputs.get("Base Color")
                    if base is not None:
                        mix = nodes.new("ShaderNodeMixRGB")
                        mix.blend_type = "MULTIPLY"
                        mix.inputs["Fac"].default_value = 1.0
                        links.new(tex.outputs["Color"], mix.inputs["Color2"])
                        if base.is_linked:
                            link = base.links[0]
                            links.new(link.from_socket, mix.inputs["Color1"])
                            links.remove(link)
                        else:
                            mix.inputs["Color1"].default_value = tuple(base.default_value)
                        links.new(mix.outputs["Color"], base)


def _bake(meshes, bake, bake_resolution):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    images = _bake_image(meshes, bake, bake_resolution)
    kinds = ("ao", "normal") if bake == "both" else (bake,)
    for obj in meshes:
        obj.select_set(True)
    for kind in kinds:
        bpy.context.view_layer.objects.active = meshes[0]
        try:
            if kind == "ao":
                bpy.ops.object.bake(type="AO", margin=16)
            else:
                bpy.ops.object.bake(type="NORMAL", margin=16)
        except Exception as exc:
            raise RenderFailed("bake %r failed: %s" % (kind, exc))
    for kind_images in images.values():
        for pairs in kind_images.values():
            for _material, image in pairs:
                image.pack()
    _wire_baked(meshes, images)


def _export_glb(path, selected):
    try:
        result = bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=bool(selected),
        )
    except Exception as exc:
        raise ExportFailed("GLB export failed: %s" % (exc,))
    if "FINISHED" not in result:
        raise ExportFailed("glTF exporter rejected the scene")
    if not os.path.exists(path):
        raise ExportFailed("GLB export finished but %r is missing" % (path,))


def _duplicate(meshes):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.duplicate()
    return list(bpy.context.selected_objects)


def _hide(meshes):
    for obj in meshes:
        obj.hide_viewport = True
        obj.hide_render = True
        obj.select_set(False)


def run(job, workdir):
    """Run `prepare_for_engine`. Returns `(produced, stats)`."""
    params = job["job"]["params"]
    outputs = job["outputs"]
    if "model" not in outputs:
        raise BadJob("prepare_for_engine declares no 'model' output")
    target_faces = max(1, int(params.get("target_faces", 5000)))
    unwrap = bool(params.get("unwrap", True))
    bake = params.get("bake", "none")
    if bake not in ("none", "ao", "normal", "both"):
        raise BadJob("unknown bake mode %r" % (bake,))
    bake_resolution = max(16, int(params.get("bake_resolution", 1024)))
    lod_count = max(0, int(params.get("lod_count", 0)))
    for index in range(1, lod_count + 1):
        if "lod_%d" % (index,) not in outputs:
            raise BadJob(
                "prepare_for_engine declares no 'lod_%d' output" % (index,)
            )

    # The empty scene gates as `no_geometry` inside `import_model`, before
    # any mesh work is spent.
    _scene, meshes = import_model(job, workdir)

    started = time.monotonic()
    _decimate(meshes, target_faces)
    if unwrap:
        _unwrap(meshes)
    if bake != "none":
        for obj in meshes:
            if not _has_uvs(obj):
                _smart_project(obj)
        _bake(meshes, bake, bake_resolution)

    produced = []
    _export_glb(os.path.join(workdir, outputs["model"]), selected=False)
    produced.append("model")

    current = meshes
    for index in range(1, lod_count + 1):
        lod = _duplicate(current)
        _hide(current)
        _decimate(lod, max(1, _face_count(current) // 2))
        _set_active(lod[0])
        for obj in lod:
            obj.select_set(True)
        _export_glb(os.path.join(workdir, outputs["lod_%d" % (index,)]), selected=True)
        produced.append("lod_%d" % (index,))
        current = lod

    stats = {
        "blender_version": bpy.app.version_string,
        "render_seconds": time.monotonic() - started,
        "objects": len(meshes),
    }
    return produced, stats
