from math import radians
from pathlib import Path

import bpy


# Nested one level deeper than the flat build scripts, so the repo root is parents[2].
ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/props/billboard.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/props/billboard.glb"

# The runtime finds this material by name and swaps in a canvas texture of the product card, so
# the string has to match src/components/city-map/city-assets.ts exactly.
FACE_MATERIAL = "Billboard Dynamic Face"

FACE_WIDTH = 3.00
FACE_HEIGHT = 1.90
FACE_CENTRE_Z = 2.80
# The card faces -Y in Blender, which the Y-up export turns into world +Z.
FACE_Y = -0.10
POST_OFFSET = 1.35


def material(name, color, roughness=0.72, metallic=0.0):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return value


def cube(name, location, scale, surface, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new("Rounded toy edge", "BEVEL")
        modifier.width = min(bevel, min(scale) * 0.8)
        modifier.segments = 3
    return obj


def cylinder(name, location, radius, depth, surface, vertices=14, bevel=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new("Soft cylinder edge", "BEVEL")
        modifier.width = min(0.045, radius * 0.5, depth * 0.4)
        modifier.segments = 2
    return obj


def card_face(name, surface):
    """A plane, not a scaled cube: the runtime paints a canvas texture onto this and needs the
    clean 0..1 UVs a plane gets, which a cube's box unwrap would not give.

    Rotated +90 degrees about X so the normal points -Y with the texture's up along +Z and its
    left-to-right along +X — i.e. unmirrored. Rotating -90 instead would flip the card upside
    down, and yawing it round to face +Y would mirror the text."""
    bpy.ops.mesh.primitive_plane_add(size=2, location=(0, FACE_Y, FACE_CENTRE_Z), rotation=(radians(90), 0, 0))
    obj = bpy.context.object
    obj.name = name
    # Local axes after the rotation: X across the board, Y up it, Z along the normal.
    obj.scale = (FACE_WIDTH / 2, FACE_HEIGHT / 2, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    return obj


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    paving = material("Billboard paving pad", (0.48, 0.51, 0.53), roughness=0.85)
    iron = material("Billboard post iron", (0.030, 0.038, 0.045), roughness=0.55, metallic=0.15)
    navy = material("Billboard frame navy", (0.03, 0.15, 0.25), roughness=0.62)
    # Fully rough and non-metallic: half of "the background colour must not shine" is the material,
    # the other half is the paper grain the runtime draws into the texture.
    face = material(FACE_MATERIAL, (1.0, 1.0, 1.0), roughness=1.0, metallic=0.0)

    for x in (-POST_OFFSET, POST_OFFSET):
        # Nothing out on the plots casts a shadow, so the pad is the only ground-contact cue.
        cylinder("billboard paving pad", (x, 0, 0.05), 0.34, 0.10, paving, 16)
        cylinder("billboard post foot", (x, 0, 0.17), 0.17, 0.22, iron, 14, bevel=False)
        cylinder("billboard post", (x, 0, 1.35), 0.10, 2.60, iron, 12)

    cube("billboard frame", (0, 0, FACE_CENTRE_Z), (1.62, 0.09, 1.06), navy, 0.07)
    card_face("Billboard Dynamic Face", face)

    # The soft, rounded read of the whole kit comes from this pass. The card is left flat: it is a
    # printed sheet, and smoothing a single quad does nothing anyway.
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and obj.name != "Billboard Dynamic Face":
            for polygon in obj.data.polygons:
                polygon.use_smooth = True

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_PATH),
        export_format="GLB",
        use_selection=True,
        export_materials="EXPORT",
        export_apply=True,
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH))


main()
