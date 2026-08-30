from math import radians
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "artwork/3d/v3/indie-garage-level-1.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/indie-garage-level-1.glb"


def material(name, color, roughness=0.72, metallic=0.0, emission=None, emission_strength=0.65):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emission:
        shader.inputs["Emission Color"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = emission_strength
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
        # A bevel wider than the thinnest half-extent self-intersects and the face silently
        # collapses on export, so trim thin trim pieces back to a width they can carry.
        modifier.width = min(bevel, min(scale) * 0.8)
        # Small trim reads the same with two segments and roughly halves its triangle count.
        modifier.segments = 3 if modifier.width >= 0.04 else 2
    return obj


def cylinder(name, location, radius, depth, surface, vertices=20, rotation=(0, 0, 0), bevel=0.04):
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
    if bevel:
        modifier = obj.modifiers.new("Soft cylinder edge", "BEVEL")
        modifier.width = min(bevel, radius * 0.5, depth * 0.4)
        modifier.segments = 2
    return obj


def torus(name, location, major_radius, minor_radius, surface, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=20,
        minor_segments=8,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    return obj


def side_window(wall_x, y, glass, navy, blue, shadow, z=2.06):
    """Deep framed glazing on a left/right wall; wall_x is the outer face, signed."""
    outward = 1 if wall_x > 0 else -1
    cube("garage side window recess", (wall_x - outward * 0.06, y, z), (0.10, 0.62, 0.58), shadow, 0.08)
    cube("garage side window glass", (wall_x + outward * 0.04, y, z), (0.05, 0.50, 0.46), glass, 0.04)
    cube("garage side window head", (wall_x + outward * 0.08, y, z + 0.54), (0.06, 0.62, 0.08), navy, 0.025)
    cube("garage side window sill", (wall_x + outward * 0.08, y, z - 0.54), (0.06, 0.62, 0.09), navy, 0.025)
    for offset in (-0.56, 0.56):
        cube("garage side window jamb", (wall_x + outward * 0.08, y + offset, z), (0.06, 0.07, 0.52), navy, 0.025)
    cube("garage side window mullion", (wall_x + outward * 0.09, y, z), (0.06, 0.05, 0.46), blue, 0.02)


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    concrete = material("Cool garage concrete", (0.46, 0.52, 0.54))
    shell = material("Garage shell", (0.86, 0.72, 0.47))
    cream_light = material("Sunlit garage trim", (0.97, 0.88, 0.65))
    workshop_wall = material("Lit workshop interior", (0.62, 0.52, 0.38), roughness=0.85)
    workshop_floor = material("Workshop floor", (0.13, 0.16, 0.18), roughness=0.8)
    navy = material("Deep garage blue", (0.03, 0.15, 0.25))
    blue = material("Garage collectible blue", (0.05, 0.34, 0.50))
    aqua = material("Bright garage aqua", (0.05, 0.55, 0.58))
    amber = material("Workshop amber", (0.95, 0.55, 0.10))
    amber_light = material("Awning amber highlight", (1.0, 0.76, 0.30))
    steel = material("Garage brushed steel", (0.34, 0.40, 0.42), roughness=0.34, metallic=0.45)
    charcoal = material("Garage charcoal metal", (0.05, 0.08, 0.09), roughness=0.52, metallic=0.15)
    shadow = material("Recess shadow", (0.02, 0.06, 0.08), roughness=0.58)
    glass = material("Garage aqua glass", (0.06, 0.38, 0.50), roughness=0.22, metallic=0.08, emission=(0.05, 0.24, 0.32))
    screen = material("Monitor glow", (0.06, 0.66, 0.76), roughness=0.24, emission=(0.05, 0.72, 0.84), emission_strength=2.0)
    work_light = material("Warm work light", (1.0, 0.80, 0.45), roughness=0.3, emission=(1.0, 0.62, 0.22), emission_strength=2.4)
    server_red = material("Server alert red", (0.85, 0.10, 0.06), emission=(0.9, 0.06, 0.03), emission_strength=1.6)
    desk_wood = material("Garage desk wood", (0.44, 0.22, 0.09), roughness=0.66)
    parcel = material("Garage parcel cardboard", (0.66, 0.42, 0.20), roughness=0.84)
    planter = material("Blue garage planter", (0.05, 0.26, 0.42))
    leaf_dark = material("Deep leaf", (0.03, 0.26, 0.13))
    leaf_mid = material("Fresh leaf", (0.07, 0.48, 0.21))
    leaf_light = material("Leaf highlight", (0.22, 0.68, 0.30))

    # Chunky single-bay shell. The facade is split into a wide open bay and a solid right
    # wall so the workshop vignette is genuinely visible rather than painted on.
    cube("garage foundation", (0, 0, 0.16), (3.95, 2.50, 0.16), concrete, 0.12)
    cube("garage back wall", (0, -2.20, 1.85), (3.72, 0.20, 1.70), shell, 0.16)
    cube("garage left wall", (-3.52, -0.05, 1.85), (0.20, 2.25, 1.70), shell, 0.16)
    cube("garage right wall", (3.52, -0.05, 1.85), (0.20, 2.25, 1.70), shell, 0.16)
    cube("garage front left pier", (-3.30, 2.20, 1.85), (0.42, 0.20, 1.70), shell, 0.16)
    cube("garage facade right wall", (2.48, 2.20, 1.85), (1.24, 0.20, 1.70), shell, 0.16)
    cube("garage bay header", (-0.82, 2.20, 3.31), (2.16, 0.20, 0.21), shell, 0.10)

    # A navy plinth band wraps every closed elevation, matching the rest of the building kit.
    cube("garage plinth back", (0, -2.20, 0.50), (3.84, 0.30, 0.24), navy, 0.09)
    cube("garage plinth left", (-3.52, -0.05, 0.50), (0.30, 2.35, 0.24), navy, 0.09)
    cube("garage plinth right", (3.52, -0.05, 0.50), (0.30, 2.35, 0.24), navy, 0.09)
    cube("garage plinth front pier", (-3.30, 2.20, 0.50), (0.50, 0.30, 0.24), navy, 0.09)
    cube("garage plinth front right", (2.48, 2.20, 0.50), (1.32, 0.30, 0.24), navy, 0.09)

    # Stepped roof tiers keep a clear socket for future vertical XP upgrades.
    cube("garage roof shadow", (0, -0.02, 3.63), (4.00, 2.56, 0.18), navy, 0.12)
    cube("garage flat roof", (0, -0.02, 3.87), (3.78, 2.34, 0.15), cream_light, 0.10)
    cube("garage raised roof bay", (-1.45, -0.30, 4.11), (1.72, 1.22, 0.14), blue, 0.10)
    cube("garage future upgrade socket", (-1.45, -0.30, 4.31), (1.16, 0.78, 0.09), aqua, 0.07)
    cube("garage roof amber cap", (-1.45, -0.30, 4.44), (0.62, 0.40, 0.07), amber, 0.05)

    # Deep framed glazing on both long walls so the model reads from a full orbit.
    for wall_x in (-3.72, 3.72):
        side_window(wall_x, -1.20, glass, navy, blue, shadow)
        side_window(wall_x, 0.60, glass, navy, blue, shadow)

    # Wide bay with a rolled-up ribbed door. The lintel sits high because the city camera looks
    # down at 35 degrees: every 1m of interior depth costs 0.7m of visible headroom.
    cube("garage roller door panel", (-0.82, 2.28, 2.92), (2.00, 0.08, 0.17), steel, 0.05)
    for index in range(4):
        cube("garage roller door rib", (-0.82, 2.37, 2.80 + index * 0.08), (1.94, 0.035, 0.020), navy, 0.010)
    cube("garage roller door top rail", (-0.82, 2.34, 3.15), (2.20, 0.10, 0.08), navy, 0.035)
    for x in (-2.92, 1.28):
        cube("garage roller door side rail", (x, 2.34, 1.72), (0.10, 0.10, 1.44), navy, 0.035)
    cube("garage bay light housing", (-0.82, 2.40, 3.34), (0.36, 0.14, 0.13), navy, 0.045)
    cube("garage bay light glow", (-0.82, 2.53, 3.30), (0.26, 0.04, 0.08), work_light, 0.03)

    # Side entrance recessed into the solid half of the facade, under a striped canopy.
    cube("garage side entrance recess", (2.48, 2.26, 1.56), (0.72, 0.16, 1.22), shadow, 0.10)
    cube("garage side entrance door", (2.48, 2.44, 1.54), (0.56, 0.05, 1.04), blue, 0.05)
    cube("garage side entrance glass", (2.48, 2.50, 1.98), (0.36, 0.03, 0.32), glass, 0.025)
    cylinder("garage side door handle", (2.82, 2.54, 1.50), 0.05, 0.24, amber, 14, (radians(90), 0, 0))
    cube("garage side entrance step", (2.48, 2.66, 0.24), (0.76, 0.26, 0.12), concrete, 0.09)
    cube("garage awning rail", (2.48, 2.48, 2.84), (0.98, 0.10, 0.08), navy, 0.035)
    for index, x in enumerate((1.76, 2.12, 2.48, 2.84, 3.20)):
        cube(
            "garage striped entry awning",
            (x, 2.72, 2.76),
            (0.19, 0.36, 0.10),
            amber_light if index % 2 == 0 else cream_light,
            0.07,
            rotation=(radians(10), 0, 0),
        )

    # Road-facing apron keeps the open bay grounded and the shared driveway readable.
    cube("garage concrete apron", (-0.86, 2.95, 0.22), (2.60, 0.57, 0.055), concrete, 0.05)
    for x in (-2.20, 0.50):
        cube("garage apron groove", (x, 2.95, 0.28), (0.025, 0.48, 0.012), navy, 0.0)

    # The workshop is staged as a shallow lit diorama pulled up against the opening: a dark floor
    # and a warm partition give every prop something to read against, and nothing sits so deep or
    # so tall that the lintel clips it out of the isometric view.
    cube("garage interior floor", (-0.82, 1.22, 0.36), (2.12, 0.94, 0.06), workshop_floor, 0.04)
    cube("garage workshop partition", (-0.82, 0.35, 1.85), (2.12, 0.08, 1.50), workshop_wall, 0.06)
    cube("garage ceiling work light", (-0.82, 1.95, 2.45), (0.78, 0.20, 0.06), work_light, 0.04)

    # Coding desk and dual monitors, squared up to the opening so both screens read.
    cube("garage coding desk top", (-1.52, 1.35, 1.22), (1.10, 0.42, 0.09), desk_wood, 0.05)
    for x in (-2.50, -0.60):
        cube("garage desk leg", (x, 1.35, 0.78), (0.09, 0.32, 0.38), steel, 0.025)
    for x in (-2.00, -1.04):
        cube("garage monitor body", (x, 1.10, 1.58), (0.40, 0.07, 0.30), navy, 0.06)
        cube("garage monitor screen", (x, 1.18, 1.58), (0.32, 0.02, 0.22), screen, 0.04)
        cube("garage monitor stand", (x, 1.02, 1.34), (0.06, 0.07, 0.14), steel, 0.02)
    cube("garage keyboard", (-1.53, 1.58, 1.36), (0.44, 0.17, 0.035), charcoal, 0.025, rotation=(radians(8), 0, 0))
    cylinder("garage coffee mug", (-0.78, 1.52, 1.46), 0.10, 0.20, cream_light, 16)

    # Compact founder chair, pulled out from the desk so its silhouette reads from the street.
    cylinder("garage chair base", (-1.52, 1.82, 0.55), 0.30, 0.08, charcoal, 16)
    cylinder("garage chair stem", (-1.52, 1.82, 0.78), 0.06, 0.40, steel, 12)
    cube("garage chair seat", (-1.52, 1.82, 1.00), (0.36, 0.30, 0.10), charcoal, 0.09)
    cube("garage chair back", (-1.52, 2.02, 1.36), (0.36, 0.10, 0.36), blue, 0.09, rotation=(radians(-8), 0, 0))

    # Server rack is the hero prop, set at the bright edge of the opening for a clear read.
    cube("garage server rack", (0.62, 1.30, 1.20), (0.46, 0.44, 0.80), navy, 0.09)
    cube("garage server rack face", (0.62, 1.72, 1.20), (0.36, 0.04, 0.66), steel, 0.035)
    for index, z in enumerate((0.70, 1.02, 1.34, 1.66)):
        cube("garage server blade", (0.62, 1.77, z), (0.28, 0.025, 0.10), charcoal, 0.02)
        cube("garage server status light", (0.80, 1.805, z), (0.04, 0.014, 0.04), server_red if index == 2 else screen, 0.012)

    # Shelving, a parcel, and pegboard tools sell the scrappy workshop story.
    for z in (0.78, 1.42):
        cube("garage storage shelf", (-2.58, 1.05, z), (0.44, 0.28, 0.05), cream_light, 0.022)
    for x in (-2.96, -2.20):
        cube("garage shelf upright", (x, 1.05, 1.28), (0.05, 0.24, 0.56), navy, 0.02)
    cube("garage prototype box", (-2.58, 1.07, 1.65), (0.28, 0.20, 0.18), parcel, 0.035)
    cube("garage electronics bin", (-2.58, 1.07, 1.00), (0.30, 0.21, 0.17), aqua, 0.035)
    cube("garage parcel box", (0.66, 1.92, 0.66), (0.38, 0.32, 0.26), parcel, 0.045, rotation=(0, 0, radians(-8)))
    cube("garage pegboard", (-0.10, 0.44, 1.10), (0.62, 0.05, 0.32), navy, 0.04)
    torus("garage cable coil", (-0.30, 0.51, 1.12), 0.16, 0.035, aqua, rotation=(radians(90), 0, 0))
    cube("garage pegboard tool", (0.16, 0.51, 1.12), (0.15, 0.03, 0.05), amber, 0.02)

    # Meter box and downpipe keep the rear elevation from reading as a blank slab.
    cube("garage service meter box", (-1.90, -2.44, 1.70), (0.34, 0.10, 0.42), aqua, 0.06)
    cube("garage service meter face", (-1.90, -2.56, 1.70), (0.24, 0.03, 0.30), navy, 0.025)
    cylinder("garage rear downpipe", (2.60, -2.46, 1.85), 0.07, 3.32, navy, 12)
    cube("garage downpipe bracket", (2.60, -2.44, 2.90), (0.13, 0.09, 0.06), steel, 0.025)

    # Rooftop utilities and the network antenna, kept to the sibling assets' prop density.
    cube("garage rooftop vent", (1.62, -0.92, 4.09), (0.50, 0.40, 0.22), aqua, 0.07)
    cube("garage rooftop vent slot", (1.62, -0.50, 4.09), (0.30, 0.03, 0.09), navy, 0.02)
    cylinder("garage network antenna mast", (2.72, -0.60, 4.60), 0.045, 1.10, navy, 12)
    cylinder("garage network receiver", (2.72, -0.60, 5.20), 0.12, 0.14, amber, 16)

    # Founder scooter parked on the apron beside the pier, fully clear of every wall and step.
    for y in (2.78, 3.32):
        cylinder("garage scooter wheel", (-3.20, y, 0.50), 0.22, 0.11, navy, 16, (0, radians(90), 0))
        cylinder("garage scooter hub", (-3.20, y, 0.50), 0.08, 0.13, amber, 14, (0, radians(90), 0), bevel=0.02)
    cube("garage scooter deck", (-3.20, 3.05, 0.50), (0.09, 0.29, 0.05), blue, 0.035)
    cylinder("garage scooter stem", (-3.20, 3.22, 1.02), 0.045, 1.06, steel, 12, (radians(-10), 0, 0))
    cylinder("garage scooter handlebar", (-3.20, 3.31, 1.54), 0.045, 0.46, navy, 12, (0, radians(90), 0))

    # One planter softens the industrial silhouette at the entrance corner.
    cylinder("garage corner planter", (3.50, 3.28, 0.44), 0.34, 0.62, planter, 18)
    for dx, dz, radius, leaf in ((0, 0.90, 0.38, leaf_mid), (-0.18, 0.80, 0.27, leaf_dark), (0.18, 0.82, 0.29, leaf_light)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=(3.50 + dx, 3.28, dz))
        foliage = bpy.context.object
        foliage.name = "garage planter foliage"
        foliage.data.materials.append(leaf)

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
