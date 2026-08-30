from math import radians
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "artwork/3d/v3/startup-building-level-1.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/startup-building-level-1.glb"


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


def cylinder(name, location, radius, depth, surface, vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
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

    concrete = material("Warm concrete", (0.38, 0.42, 0.40))
    cream = material("Warm cream walls", (0.82, 0.68, 0.43))
    cream_light = material("Sunlit wall trim", (0.96, 0.84, 0.58))
    teal = material("Deep creator teal", (0.035, 0.24, 0.28))
    teal_mid = material("Storefront teal", (0.055, 0.39, 0.44))
    yellow = material("Startup gold", (0.95, 0.55, 0.10))
    yellow_light = material("Awning highlight", (1.0, 0.76, 0.25))
    glass = material("Warm blue glass", (0.08, 0.36, 0.48), roughness=0.22, metallic=0.08, emission=(0.05, 0.22, 0.30))
    dark = material("Recess shadow", (0.025, 0.07, 0.085), roughness=0.58)
    planter = material("Terracotta planter", (0.62, 0.20, 0.10))
    leaf_dark = material("Shrub deep green", (0.05, 0.29, 0.12))
    leaf_mid = material("Shrub green", (0.08, 0.48, 0.18))
    leaf_light = material("Shrub highlight", (0.23, 0.68, 0.26))

    # Chunky single-floor mass with visible upgrade-ready roof tiers.
    cube("foundation", (0, 0, 0.16), (4.05, 2.55, 0.16), concrete, 0.12)
    cube("main one-floor building", (0, 0, 1.85), (3.85, 2.35, 1.68), cream, 0.18)
    cube("lower teal plinth", (0, 0, 0.46), (3.94, 2.42, 0.25), teal, 0.09)
    cube("roof shadow tier", (0, 0, 3.57), (4.08, 2.58, 0.18), teal, 0.12)
    cube("flat upgrade roof", (0, 0, 3.82), (3.83, 2.34, 0.16), cream_light, 0.10)
    cube("roof upgrade socket", (0, 0, 4.04), (2.52, 1.42, 0.11), teal_mid, 0.08)
    cube("roof gold cap", (0, 0, 4.20), (1.12, 0.72, 0.08), yellow, 0.07)

    # Deep storefront recesses, windows, and entrance.
    for x in (-2.30, 2.30):
        cube("deep window recess", (x, 2.38, 1.72), (1.02, 0.16, 0.92), dark, 0.10)
        cube("storefront glass", (x, 2.56, 1.72), (0.82, 0.045, 0.73), glass, 0.07)
        cube("window top frame", (x, 2.62, 2.51), (0.98, 0.08, 0.09), teal, 0.035)
        cube("window sill", (x, 2.62, 0.93), (0.98, 0.10, 0.10), teal, 0.035)
        cube("window side frame", (x - 0.90, 2.62, 1.72), (0.09, 0.08, 0.82), teal, 0.035)
        cube("window side frame", (x + 0.90, 2.62, 1.72), (0.09, 0.08, 0.82), teal, 0.035)
        cube("window mullion", (x, 2.63, 1.72), (0.055, 0.075, 0.75), teal, 0.025)

    cube("entrance recess", (0, 2.40, 1.50), (0.82, 0.18, 1.28), dark, 0.10)
    cube("glass entrance door", (0, 2.59, 1.48), (0.62, 0.045, 1.08), glass, 0.07)
    cube("door frame top", (0, 2.64, 2.65), (0.80, 0.08, 0.10), teal, 0.035)
    for x in (-0.72, 0.72):
        cube("door frame side", (x, 2.64, 1.48), (0.09, 0.08, 1.12), teal, 0.035)
    cylinder("door handle", (0.43, 2.69, 1.47), 0.055, 0.28, yellow, vertices=14).rotation_euler = (radians(90), 0, 0)
    cube("front entrance step", (0, 2.76, 0.24), (1.10, 0.55, 0.12), concrete, 0.09)

    # One simple striped awning to make Level 1 readable without over-decoration.
    cube("awning support", (0, 2.73, 2.79), (1.10, 0.10, 0.09), teal, 0.04)
    for index, x in enumerate((-0.88, -0.44, 0, 0.44, 0.88)):
        cube(
            "striped entrance awning",
            (x, 2.96, 2.72),
            (0.22, 0.36, 0.10),
            yellow_light if index % 2 == 0 else teal_mid,
            0.08,
            rotation=(radians(10), 0, 0),
        )

    # Minimal starter landscaping: exactly one planter and one small shrub.
    cylinder("single starter planter", (3.20, 2.82, 0.48), 0.38, 0.68, planter, vertices=18)
    for index, (dx, dy, dz, scale) in enumerate((
        (0, 0, 0.98, 0.46), (-0.23, 0.03, 0.88, 0.34), (0.21, -0.02, 0.90, 0.36)
    )):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=scale, location=(3.20 + dx, 2.82 + dy, dz))
        leaf = bpy.context.object
        leaf.name = "starter planter foliage"
        leaf.data.materials.append((leaf_light, leaf_mid, leaf_dark)[index])

    for index, (dx, dy, radius, surface) in enumerate((
        (-3.20, 1.78, 0.48, leaf_dark), (-3.42, 1.98, 0.36, leaf_mid), (-2.97, 1.98, 0.33, leaf_light)
    )):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=(dx, dy, 0.50))
        shrub = bpy.context.object
        shrub.name = "single small starter shrub"
        shrub.data.materials.append(surface)

    # Add weighted normals and keep every object game-ready.
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
