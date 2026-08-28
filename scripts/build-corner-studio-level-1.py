from math import radians
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "artwork/3d/v3/corner-studio-level-1.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/corner-studio-level-1.glb"


def material(name, color, roughness=0.7, metallic=0.0, emission=None):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emission:
        shader.inputs["Emission Color"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = 0.5
    return value


def cube(name, location, scale, surface, bevel=0.0, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new("Rounded collectible edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    return obj


def cylinder(name, location, radius, depth, surface, vertices=20, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    bevel = obj.modifiers.new("Soft cylinder edge", "BEVEL")
    bevel.width = 0.04
    bevel.segments = 2
    return obj


def front_window(x, width, wall_y, glass, navy, shadow, z=1.7):
    cube("front window recess", (x, wall_y, z), (width, 0.15, 0.84), shadow, 0.09)
    cube("front blue glass", (x, wall_y + 0.17, z), (width - 0.14, 0.04, 0.68), glass, 0.055)
    cube("front window header", (x, wall_y + 0.22, z + 0.78), (width, 0.07, 0.075), navy, 0.025)
    cube("front window sill", (x, wall_y + 0.22, z - 0.78), (width, 0.08, 0.075), navy, 0.025)
    cube("front window mullion", (x, wall_y + 0.23, z), (0.055, 0.07, 0.70), navy, 0.018)


def side_window(y, width, wall_x, glass, navy, shadow, z=2.18):
    cube("wraparound side recess", (wall_x, y, z), (0.15, width, 0.76), shadow, 0.09)
    cube("wraparound side glass", (wall_x + 0.17, y, z), (0.04, width - 0.14, 0.60), glass, 0.055)
    cube("side window mullion", (wall_x + 0.23, y, z), (0.07, 0.055, 0.63), navy, 0.018)


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    concrete = material("Cool stone foundation", (0.46, 0.52, 0.54))
    cream = material("Warm studio cream", (0.91, 0.77, 0.53))
    cream_light = material("Sunlit cream trim", (0.98, 0.89, 0.67))
    navy = material("Deep studio blue", (0.025, 0.12, 0.22))
    blue = material("Collectible blue", (0.04, 0.31, 0.49))
    turquoise = material("Bright turquoise trim", (0.04, 0.57, 0.58))
    coral = material("Studio coral", (0.93, 0.25, 0.18))
    coral_light = material("Awning coral highlight", (1.0, 0.48, 0.30))
    gold = material("Startup gold", (0.98, 0.67, 0.16))
    glass = material(
        "Deep aqua glass",
        (0.035, 0.38, 0.52),
        roughness=0.2,
        metallic=0.08,
        emission=(0.025, 0.18, 0.25),
    )
    shadow = material("Contact shadow recess", (0.012, 0.045, 0.075), roughness=0.56)
    planter = material("Blue ceramic planter", (0.04, 0.25, 0.42))
    dynamic_sign_face = material("Dynamic billboard face", (1.0, 1.0, 1.0), roughness=0.74)
    leaf_dark = material("Deep leaf", (0.025, 0.25, 0.13))
    leaf_mid = material("Fresh leaf", (0.06, 0.48, 0.22))
    leaf_light = material("Leaf highlight", (0.22, 0.69, 0.31))

    # An unmistakable L-shaped footprint: a broad rear studio and a taller corner wing.
    cube("L foundation rear", (-0.15, -0.65, 0.16), (3.95, 1.72, 0.16), concrete, 0.12)
    cube("L foundation corner", (2.55, 1.40, 0.16), (1.25, 2.05, 0.16), concrete, 0.12)
    cube("broad studio wing", (-0.15, -0.65, 1.72), (3.75, 1.55, 1.52), cream, 0.18)
    cube("raised entrance tower", (2.55, 1.25, 2.08), (1.10, 1.90, 1.88), blue, 0.18)
    cube("rear wing navy plinth", (-0.15, -0.65, 0.43), (3.84, 1.64, 0.24), navy, 0.08)
    cube("tower navy plinth", (2.55, 1.25, 0.43), (1.18, 1.97, 0.24), navy, 0.08)

    # Stepped flat roofs clearly reserve sockets for future vertical XP upgrades.
    cube("studio roof shadow", (-0.15, -0.65, 3.30), (3.95, 1.74, 0.18), navy, 0.11)
    cube("studio flat roof", (-0.15, -0.65, 3.53), (3.72, 1.52, 0.14), cream_light, 0.09)
    cube("tower roof shadow", (2.55, 1.25, 4.04), (1.25, 2.04, 0.18), navy, 0.11)
    cube("tower flat roof", (2.55, 1.25, 4.28), (1.08, 1.86, 0.14), coral, 0.09)
    cube("future upgrade socket", (2.55, 1.10, 4.48), (0.62, 1.05, 0.08), turquoise, 0.06)

    # Long storefront glazing across the inner arm of the L.
    front_window(-2.55, 0.86, 0.92, glass, navy, shadow)
    front_window(-0.55, 0.86, 0.92, glass, navy, shadow)
    front_window(1.15, 0.72, 0.92, glass, navy, shadow)

    # Deep entrance and bright striped canopy on the corner tower.
    cube("deep corner entrance", (2.55, 3.17, 1.58), (0.70, 0.16, 1.22), shadow, 0.10)
    cube("corner glass door", (2.55, 3.35, 1.58), (0.54, 0.04, 1.02), glass, 0.06)
    cube("door frame top", (2.55, 3.40, 2.69), (0.70, 0.08, 0.09), navy, 0.03)
    for x in (1.92, 3.18):
        cube("door frame side", (x, 3.40, 1.58), (0.08, 0.08, 1.08), navy, 0.03)
    cylinder("gold door handle", (2.90, 3.45, 1.54), 0.05, 0.24, gold, 14, (radians(90), 0, 0))
    cube("corner entry step", (2.55, 3.52, 0.24), (0.98, 0.50, 0.12), concrete, 0.08)
    cube("awning rail", (2.55, 3.44, 2.82), (0.97, 0.10, 0.08), navy, 0.035)
    for index, x in enumerate((1.78, 2.16, 2.55, 2.94, 3.32)):
        cube(
            "striped corner awning",
            (x, 3.68, 2.74),
            (0.19, 0.36, 0.10),
            coral_light if index % 2 == 0 else cream_light,
            0.07,
            rotation=(radians(10), 0, 0),
        )

    # Wraparound tower windows make the silhouette read from a full 360-degree orbit.
    side_window(0.80, 0.70, 3.66, glass, navy, shadow)
    side_window(-0.85, 0.64, 3.66, glass, navy, shadow)

    # Tall freestanding plot sign on the grass beside the driveway, facing the road.
    sign_x = -2.62
    for x in (sign_x - 0.86, sign_x + 0.86):
        cylinder("billboard support post", (x, 3.08, 0.74), 0.10, 1.28, navy, 14)
        cylinder("billboard post foot", (x, 3.08, 0.13), 0.18, 0.15, concrete, 16)
    cube("freestanding billboard frame", (sign_x, 3.08, 1.66), (1.34, 0.18, 1.06), navy, 0.13)
    cube("Billboard Dynamic Face", (sign_x, 3.28, 1.66), (1.16, 0.035, 0.88), dynamic_sign_face, 0.08)

    # A small rooftop utility cluster and antenna add startup-workshop personality.
    cube("roof utility box", (-1.35, -0.70, 3.78), (0.52, 0.40, 0.22), turquoise, 0.07)
    cube("utility box vent", (-1.35, -0.27, 3.78), (0.31, 0.025, 0.09), navy, 0.02)
    cylinder("antenna mast", (2.55, 1.20, 5.08), 0.045, 1.05, navy, 12)
    cylinder("antenna cap", (2.55, 1.20, 5.64), 0.11, 0.14, coral, 14)

    # Two compact planters frame the entrance without crowding the Level 1 plot.
    for index, x in enumerate((1.42, 3.55)):
        cylinder("corner studio planter", (x, 3.20, 0.43), 0.34, 0.60, planter, 18)
        for dx, dz, radius, leaf in (
            (0, 0.88, 0.38, leaf_mid),
            (-0.18, 0.78, 0.27, leaf_dark),
            (0.18, 0.80, 0.29, leaf_light),
        ):
            bpy.ops.mesh.primitive_ico_sphere_add(
                subdivisions=2,
                radius=radius,
                location=(x + dx, 3.20, dz),
            )
            bpy.context.object.name = f"planter {index + 1} foliage"
            bpy.context.object.data.materials.append(leaf)

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
