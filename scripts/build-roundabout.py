import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "artwork/3d/v3/roundabout.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/roundabout.glb"

OUTER_RADIUS = 9.5
INNER_RADIUS = 5.2
CURB_RADIUS = 5.5
GRASS_RADIUS = 5.35
SEGMENTS = 64
# Deliberately below the straight roads' 0.06 deck: the approach arms tuck slightly under the
# ring so their straight edges don't leave gaps against the curve, and equal heights would z-fight.
ASPHALT_HEIGHT = 0.05


def material(name, color, roughness=0.65):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    return value


def cube(name, location, scale, surface, bevel=0.0, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new("Soft corners", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def cylinder(name, location, radius, depth, surface, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    return obj


def annulus(name, inner, outer, height, surface, segments=SEGMENTS):
    """Flat ring built from two vertex rings — no curved primitive exists in this pipeline."""
    vertices = []
    for index in range(segments):
        angle = 2 * math.pi * index / segments
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        vertices.append((inner * cos_a, inner * sin_a, height))
        vertices.append((outer * cos_a, outer * sin_a, height))

    faces = []
    for index in range(segments):
        next_index = (index + 1) % segments
        faces.append((2 * index, 2 * index + 1, 2 * next_index + 1, 2 * next_index))

    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(surface)
    return obj


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    asphalt = material("Road asphalt", (0.055, 0.085, 0.10))
    marking = material("Road paint", (0.96, 0.87, 0.60))
    curb = material("Roundabout curb", (0.48, 0.51, 0.53), roughness=0.9)
    grass = material("Roundabout grass", (0.10, 0.36, 0.08), roughness=0.9)

    annulus("roundabout asphalt", INNER_RADIUS, OUTER_RADIUS, ASPHALT_HEIGHT, asphalt)

    # Curb overlaps the annulus inner edge so there is no seam; grass sits inside it, leaving a rim.
    cylinder("roundabout curb", (0, 0, 0.07), CURB_RADIUS, 0.14, curb)
    cylinder("roundabout island grass", (0, 0, 0.095), GRASS_RADIUS, 0.19, grass)

    dash_count = 24
    dash_radius = 7.35
    for index in range(dash_count):
        angle = 2 * math.pi * index / dash_count
        cube(
            "lane dash",
            (dash_radius * math.cos(angle), dash_radius * math.sin(angle), 0.055),
            (0.55, 0.08, 0.006),
            marking,
            rotation=(0, 0, angle + math.pi / 2),
        )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT_PATH), export_format="GLB", use_selection=True, export_materials="EXPORT", export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH))


main()
