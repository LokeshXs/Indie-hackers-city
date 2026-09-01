from math import cos, pi, radians, sin
from pathlib import Path

import bpy


# Nested a level deeper than the flat build scripts, so the repo root is parents[2].
ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/landmarks/launch-monument.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/landmarks/launch-monument.glb"


def material(name, color, roughness=0.72, metallic=0.0, emission=None):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emission:
        shader.inputs["Emission Color"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = 0.65
    return value


def cube(name, location, scale, surface, bevel=0.0, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new("Rounded toy edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    return obj


def fin(name, surface, root_radius, tip_radius, base_z, top_z, thickness, heading, bevel=0.06):
    """Swept triangular fin: sits against the body from base_z to top_z and sweeps out to
    tip_radius at the bottom. Built from vertices, then given the same bevel modifier as the
    primitive helpers so it still reads as part of the soft toy kit."""
    hx, hy = cos(heading), sin(heading)
    tx, ty = -sin(heading), cos(heading)
    half = thickness / 2

    def point(radius, z, side):
        return (hx * radius + tx * side * half, hy * radius + ty * side * half, z)

    vertices = []
    for side in (-1, 1):
        vertices.append(point(root_radius, top_z, side))
        vertices.append(point(root_radius, base_z, side))
        vertices.append(point(tip_radius, base_z, side))
    faces = [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]

    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(surface)

    # Hand-wound faces can end up inside-out, which would render as holes under backface culling.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)

    modifier = obj.modifiers.new("Rounded toy edge", "BEVEL")
    modifier.width = bevel
    modifier.segments = 3
    return obj


def cylinder(name, location, radius, depth, surface, vertices=20, radius2=None, rotation=(0, 0, 0)):
    """Matches the building kit's helper: always softened with a bevel. `radius2` taps
    primitive_cone_add so tapered sections and the nose inherit the same treatment."""
    if radius2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius2, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    bevel = obj.modifiers.new("Soft cylinder edge", "BEVEL")
    bevel.width = 0.045
    bevel.segments = 2
    return obj


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    # Same kit as the buildings — no new colours.
    concrete = material("Warm concrete", (0.38, 0.42, 0.40))
    cream = material("Warm cream walls", (0.82, 0.68, 0.43))
    cream_light = material("Sunlit wall trim", (0.96, 0.84, 0.58))
    teal = material("Deep creator teal", (0.035, 0.24, 0.28))
    teal_mid = material("Storefront teal", (0.055, 0.39, 0.44))
    # The rocket itself is the classic red-and-white toy scheme rather than the city's cream and
    # teal — a landmark should read as its own object. Still built with the same bevelled,
    # smooth-shaded kit so it sits in the same world.
    rocket_white = material("Rocket white", (0.95, 0.95, 0.93), roughness=0.45)
    rocket_red = material("Rocket red", (0.72, 0.05, 0.04), roughness=0.5)
    chrome = material("Engine chrome", (0.52, 0.55, 0.58), roughness=0.28, metallic=0.6)
    porthole = material("Porthole glass", (0.38, 0.46, 0.54), roughness=0.14, metallic=0.25, emission=(0.05, 0.09, 0.12))
    flame_outer = material("Launch flame", (0.95, 0.35, 0.05), roughness=0.35, emission=(0.95, 0.35, 0.05))
    flame_core = material("Launch flame core", (1.0, 0.80, 0.20), roughness=0.3, emission=(1.0, 0.80, 0.20))
    leaf_dark = material("Shrub deep green", (0.05, 0.29, 0.12))
    leaf_mid = material("Shrub green", (0.08, 0.48, 0.18))
    leaf_light = material("Shrub highlight", (0.23, 0.68, 0.26))

    # Low, quiet pad tiers — the rocket should carry the silhouette, not the plinth.
    cylinder("launch pad", (0, 0, 0.15), 3.05, 0.30, concrete)
    cylinder("pad trim ring", (0, 0, 0.34), 2.75, 0.10, chrome)
    cylinder("pad inner deck", (0, 0, 0.46), 1.95, 0.16, concrete)

    # Mid-liftoff: the fins carry the weight down to the deck, leaving the engine clear so the
    # exhaust plume has somewhere to go.
    cylinder("launch flame", (0, 0, 0.92), 0.10, 0.64, flame_outer, radius2=0.54, vertices=16)
    cylinder("launch flame core", (0, 0, 1.00), 0.05, 0.48, flame_core, vertices=16, radius2=0.32)
    cylinder("engine nozzle", (0, 0, 1.36), 0.86, 0.44, chrome, radius2=0.68)
    cylinder("engine collar", (0, 0, 1.66), 0.74, 0.28, chrome)

    # Straight white shaft, red band, tall red cone — the silhouette from the reference.
    cylinder("main body", (0, 0, 4.15), 0.95, 5.00, rocket_white)
    cylinder("upper red band", (0, 0, 6.78), 0.98, 0.26, rocket_red)
    cylinder("nose cone", (0, 0, 8.78), 0.95, 3.70, rocket_red, radius2=0.02)

    # Chrome-ringed porthole, sunk into the hull, ringed by red rivet studs.
    cylinder("porthole ring", (0, -0.92, 5.30), 0.42, 0.18, chrome, rotation=(radians(90), 0, 0))
    cylinder("porthole glass", (0, -0.95, 5.30), 0.32, 0.09, porthole, rotation=(radians(90), 0, 0))
    for index in range(8):
        around = 2 * pi * index / 8
        # Wrap the stud ring onto the hull so every rivet sits on the curved surface.
        offset_angle = (sin(around) * 0.66) / 0.95
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=1,
            radius=0.075,
            location=(sin(offset_angle) * 0.93, -cos(offset_angle) * 0.93, 5.30 + cos(around) * 0.66),
        )
        stud = bpy.context.object
        stud.name = "hull rivet"
        stud.data.materials.append(rocket_red)

    # Three big swept red fins reaching the deck, with chrome landing feet.
    for index in range(3):
        heading = 2 * pi * index / 3
        fin("stabiliser fin", rocket_red, 0.94, 2.35, 0.55, 3.80, 0.17, heading)
        cube(
            "landing foot",
            (cos(heading) * 2.10, sin(heading) * 2.10, 0.62),
            (0.26, 0.17, 0.07),
            chrome,
            0.03,
            rotation=(0, 0, heading),
        )

    # Hedge ring and benches — same shrub pattern as the building planters. The island's lamps are
    # not built here: they are street-lamp entities placed from map-data, so the whole city shares
    # one lamp design.
    for index in range(10):
        angle = 2 * pi * index / 10
        cylinder_tone = (leaf_mid, leaf_dark, leaf_light)[index % 3]
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=2,
            radius=0.50,
            location=(cos(angle) * 4.60, sin(angle) * 4.60, 0.32),
        )
        hedge = bpy.context.object
        hedge.name = "island hedge"
        hedge.data.materials.append(cylinder_tone)

    for angle in (radians(50), radians(230)):
        # Benches sit tangentially facing the rocket. Legs run along the seat (tangential) —
        # offsetting them radially instead would push one leg onto the pad.
        radial_x, radial_y = cos(angle), sin(angle)
        along_x, along_y = -sin(angle), cos(angle)
        bx, by = radial_x * 4.05, radial_y * 4.05
        facing = angle + pi / 2
        cube("bench seat", (bx, by, 0.46), (0.90, 0.24, 0.07), cream, 0.05, rotation=(0, 0, facing))
        cube(
            "bench back",
            (bx + radial_x * 0.20, by + radial_y * 0.20, 0.70),
            (0.90, 0.07, 0.22),
            teal,
            0.05,
            rotation=(0, 0, facing),
        )
        for end in (-1, 1):
            cube(
                "bench leg",
                (bx + along_x * end * 0.66, by + along_y * end * 0.66, 0.23),
                (0.10, 0.20, 0.23),
                concrete,
                0.03,
                rotation=(0, 0, facing),
            )

    # The soft, rounded read of the whole kit comes from this pass.
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            for polygon in obj.data.polygons:
                polygon.use_smooth = True

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH))
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_PATH),
        export_format="GLB",
        use_selection=True,
        export_materials="EXPORT",
        export_apply=True,
        export_yup=True,
    )


main()
