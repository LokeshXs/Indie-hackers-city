import math
from pathlib import Path

import bpy


# Nested one level deeper than the other build scripts, so the repo root is parents[2].
ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/trees/palm-tree.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/trees/palm-tree.glb"

TRUNK_HEIGHT = 6.8
TRUNK_BASE_RADIUS = 0.42
TRUNK_TOP_RADIUS = 0.28
TRUNK_SIDES = 12
TRUNK_STATIONS = 14

FROND_COUNT = 11
FROND_LENGTH = 3.9
FROND_STATIONS = 7
FROND_BASE_HALF_WIDTH = 0.35
FROND_TIP_HALF_WIDTH = 0.05
# Fronds lift away from the crown before arching over, so the silhouette domes out to roughly
# 7.4 tall and 6.4 across rather than collapsing straight down the trunk.
FROND_START_ANGLE = math.radians(50)
FROND_END_ANGLE = math.radians(-35)
FROND_DROOP_EASING = 1.2


def material(name, color, roughness=0.72):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    return value


def build_mesh(name, vertices, faces, materials, material_indices=None):
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for surface in materials:
        obj.data.materials.append(surface)
    if material_indices:
        for polygon, index in zip(obj.data.polygons, material_indices):
            polygon.material_index = index
    return obj


def trunk(name, surface):
    """Tapered tube. The radius wobbles slightly so it reads as a fibrous palm trunk
    without needing extra objects (each object costs a draw call per planted tree)."""
    vertices = []
    for station in range(TRUNK_STATIONS):
        t = station / (TRUNK_STATIONS - 1)
        # Ease the taper so the base flares a little, like the reference photo.
        radius = TRUNK_BASE_RADIUS + (TRUNK_TOP_RADIUS - TRUNK_BASE_RADIUS) * (t ** 0.7)
        radius += math.sin(t * math.pi * 7) * 0.018
        z = TRUNK_HEIGHT * t
        for side in range(TRUNK_SIDES):
            angle = 2 * math.pi * side / TRUNK_SIDES
            vertices.append((radius * math.cos(angle), radius * math.sin(angle), z))

    faces = []
    for station in range(TRUNK_STATIONS - 1):
        for side in range(TRUNK_SIDES):
            next_side = (side + 1) % TRUNK_SIDES
            lower = station * TRUNK_SIDES
            upper = (station + 1) * TRUNK_SIDES
            faces.append((lower + side, lower + next_side, upper + next_side, upper + side))

    obj = build_mesh(name, vertices, faces, [surface])
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def crown(name, surfaces):
    """All fronds accumulated into a single object with two material slots, so the whole
    crown exports as just two glTF primitives."""
    vertices = []
    faces = []
    material_indices = []

    for frond in range(FROND_COUNT):
        heading = 2 * math.pi * frond / FROND_COUNT
        cos_h, sin_h = math.cos(heading), math.sin(heading)
        # Alternate the droop a little so the crown is not perfectly uniform.
        droop = FROND_END_ANGLE - math.radians(6) * (frond % 3)
        base_index = len(vertices)

        for station in range(FROND_STATIONS):
            t = station / (FROND_STATIONS - 1)
            pitch = FROND_START_ANGLE + (droop - FROND_START_ANGLE) * (t ** FROND_DROOP_EASING)
            reach = FROND_LENGTH * t
            radial = reach * math.cos(pitch)
            z = TRUNK_HEIGHT + reach * math.sin(pitch)
            half_width = FROND_BASE_HALF_WIDTH + (FROND_TIP_HALF_WIDTH - FROND_BASE_HALF_WIDTH) * t
            # Offset across the frond's own spine, perpendicular to its heading.
            for side in (-1, 1):
                vertices.append((
                    radial * cos_h - side * half_width * sin_h,
                    radial * sin_h + side * half_width * cos_h,
                    z,
                ))

        for station in range(FROND_STATIONS - 1):
            lower = base_index + station * 2
            faces.append((lower, lower + 1, lower + 3, lower + 2))
            material_indices.append(frond % 2)

    return build_mesh(name, vertices, faces, surfaces, material_indices)


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    bark = material("Palm bark", (0.30, 0.20, 0.11), roughness=0.9)
    frond_mid = material("Fresh leaf", (0.06, 0.48, 0.22))
    frond_light = material("Leaf highlight", (0.22, 0.69, 0.31))

    trunk("palm trunk", bark)
    crown("palm crown", [frond_mid, frond_light])

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT_PATH), export_format="GLB", use_selection=True, export_materials="EXPORT", export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH))


main()
