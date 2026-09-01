import math
from pathlib import Path

import bpy


# Nested one level deeper than the other build scripts, so the repo root is parents[2].
ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/trees/palm-tree.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/trees/palm-tree.glb"

# Sized to sit under the level-1 buildings (4.28 / 5.27 / 5.71) instead of over them, and narrow
# enough that a scale-1.1 crown still clears the 5.9-wide avenue verge it is planted on.
TRUNK_HEIGHT = 4.87
TRUNK_BASE_RADIUS = 0.40
TRUNK_TOP_RADIUS = 0.26
TRUNK_SIDES = 12
TRUNK_STATIONS = 12

FROND_COUNT = 12
FROND_LENGTH = 2.49
FROND_STATIONS = 7
FROND_BASE_HALF_WIDTH = 0.34
# Blunt tips, not needles. A tip this narrow used to run out into a hairline that read as broken
# wire hanging off the crown, and it left the bevel almost nothing to work with.
FROND_TIP_HALF_WIDTH = 0.15
# Fronds are solid strips with a raised centre spine and a flat underside, not flat ribbons: the
# V-section is what keeps them readable when a frond swings edge-on to the isometric camera, and
# it is what lets them self-shade instead of washing out to mint under the overhead sky light.
FROND_SPINE_LIFT = 0.10
FROND_THICKNESS = 0.055
# Fronds lift away from the crown before arching over, so the silhouette domes out rather than
# collapsing straight down the trunk.
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

    # Hand-wound faces can end up inside-out, which would render as holes under backface culling.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return obj


def cylinder(name, location, radius, depth, surface, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    bevel = obj.modifiers.new("Soft cylinder edge", "BEVEL")
    bevel.width = min(0.045, radius * 0.5, depth * 0.4)
    bevel.segments = 2
    return obj


def trunk_radius(t):
    """Eased taper with a slight fibrous ripple, flaring at the base like the reference photo."""
    return TRUNK_BASE_RADIUS + (TRUNK_TOP_RADIUS - TRUNK_BASE_RADIUS) * (t ** 0.7) + math.sin(t * math.pi * 7) * 0.018


def trunk(name, surface):
    """Tapered tube, capped at both ends. One object because each costs a draw call per planted
    tree, and 32 of these are planted."""
    vertices = []
    for station in range(TRUNK_STATIONS):
        t = station / (TRUNK_STATIONS - 1)
        radius = trunk_radius(t)
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

    # Caps: the old tube was open at both ends, which left a hole under the crown.
    base_centre = len(vertices)
    vertices.append((0.0, 0.0, 0.0))
    top_centre = len(vertices)
    vertices.append((0.0, 0.0, TRUNK_HEIGHT))
    top_ring = (TRUNK_STATIONS - 1) * TRUNK_SIDES
    for side in range(TRUNK_SIDES):
        next_side = (side + 1) % TRUNK_SIDES
        faces.append((base_centre, next_side, side))
        faces.append((top_centre, top_ring + side, top_ring + next_side))

    obj = build_mesh(name, vertices, faces, [surface])
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def crown(name, surfaces):
    """All fronds accumulated into one object with three material slots, so the whole crown still
    exports as three glTF primitives. Each frond is a closed solid with a V cross-section."""
    vertices = []
    faces = []
    material_indices = []
    section = 4

    for frond in range(FROND_COUNT):
        heading = 2 * math.pi * frond / FROND_COUNT
        cos_h, sin_h = math.cos(heading), math.sin(heading)
        # Alternate the droop a little so the crown is not perfectly uniform.
        droop = FROND_END_ANGLE - math.radians(4) * (frond % 3)
        base_index = len(vertices)

        for station in range(FROND_STATIONS):
            t = station / (FROND_STATIONS - 1)
            pitch = FROND_START_ANGLE + (droop - FROND_START_ANGLE) * (t ** FROND_DROOP_EASING)
            reach = FROND_LENGTH * t
            radial = reach * math.cos(pitch)
            z = TRUNK_HEIGHT + reach * math.sin(pitch)
            half_width = FROND_BASE_HALF_WIDTH + (FROND_TIP_HALF_WIDTH - FROND_BASE_HALF_WIDTH) * t
            # Taper the section towards the tip so the frond comes to a blade rather than a slab.
            lift = FROND_SPINE_LIFT * (1.0 - 0.35 * t)
            drop = FROND_THICKNESS * (1.0 - 0.35 * t)

            def across(offset, dz):
                return (
                    radial * cos_h - offset * sin_h,
                    radial * sin_h + offset * cos_h,
                    z + dz,
                )

            # Wound consistently around the section: spine, right edge, underside, left edge.
            vertices.append(across(0.0, lift))
            vertices.append(across(half_width, 0.0))
            vertices.append(across(0.0, -drop))
            vertices.append(across(-half_width, 0.0))

        for station in range(FROND_STATIONS - 1):
            lower = base_index + station * section
            upper = lower + section
            for corner in range(section):
                nxt = (corner + 1) % section
                faces.append((lower + corner, lower + nxt, upper + nxt, upper + corner))
                material_indices.append(frond % 3)

        # Cap the root and the tip so the frond is a closed solid.
        tip = base_index + (FROND_STATIONS - 1) * section
        faces.append((base_index, base_index + 1, base_index + 2, base_index + 3))
        material_indices.append(frond % 3)
        faces.append((tip + 3, tip + 2, tip + 1, tip))
        material_indices.append(frond % 3)

    obj = build_mesh(name, vertices, faces, surfaces, material_indices)
    modifier = obj.modifiers.new("Rounded toy edge", "BEVEL")
    modifier.width = 0.012
    modifier.segments = 2
    return obj


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    soil = material("Tree soil ring", (0.115, 0.088, 0.052), roughness=0.9)
    bark = material("Palm bark", (0.235, 0.140, 0.072), roughness=0.9)
    bark_band = material("Palm bark band", (0.145, 0.085, 0.045), roughness=0.9)
    # The kit's shrub greens (hue ~150 deg) are teal-leaning. That reads fine on a 0.3-radius
    # planter shrub, but at tree scale against the yellow-green grass (hue ~113 deg) it goes mint
    # and fights the verge. These sit in the grass's own hue family and run darker than it, so a
    # tree reads as a mass of foliage standing on grass rather than a pale blob floating over it.
    leaf_dark = material("Tree canopy deep", (0.025, 0.125, 0.032))
    leaf_mid = material("Tree canopy mid", (0.058, 0.245, 0.055))
    leaf_light = material("Tree canopy light", (0.125, 0.375, 0.095))
    coconut = material("Coconut cluster", (0.62, 0.38, 0.10), roughness=0.6)

    # These trees sit far outside the light's shadow frustum, so a soil ring is the only thing
    # that reads as ground contact — the same trick that grounds the sign gantry's pillars.
    cylinder("palm soil ring", (0, 0, 0.05), 0.74, 0.10, soil, 20)
    cylinder("palm root flare", (0, 0, 0.19), 0.50, 0.26, bark, 16)

    trunk("palm trunk", bark)
    # Chunky bark bands, the kit's plinth/collar/trim idiom applied to a trunk.
    for height in (1.25, 2.45, 3.60):
        t = height / TRUNK_HEIGHT
        cylinder("palm bark band", (0, 0, height), trunk_radius(t) + 0.045, 0.14, bark_band, 14)

    # A solid hub where the fronds meet, so the crown reads as one mass rather than loose blades.
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.46, location=(0, 0, TRUNK_HEIGHT))
    hub = bpy.context.object
    hub.name = "palm crown hub"
    hub.data.materials.append(leaf_dark)

    # At z-0.30 the hub is only 0.35 across, so a 0.42 radius clears its silhouette; any closer
    # and the nuts vanish inside it.
    for index, (dx, dy) in enumerate(((0.40, 0.13), (-0.30, 0.29), (-0.12, -0.40))):
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=1,
            radius=0.14,
            location=(dx, dy, TRUNK_HEIGHT - 0.30),
        )
        nut = bpy.context.object
        nut.name = "palm coconut"
        nut.data.materials.append(coconut)

    # Three tones like every other foliage cluster in the kit, cycled over a frond count that
    # divides by three so the alternation has no seam.
    crown("palm crown", [leaf_mid, leaf_dark, leaf_light])

    # The soft, rounded read of the whole kit comes from this pass.
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
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
