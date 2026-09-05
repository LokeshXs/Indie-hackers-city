"""What rises out of an opened reward box: one model per unlock, plus a fallback.

The reward ladder's earned rung shows `reward-gift-opened.glb` with exactly one of these dropped
into its mouth. Splitting them from the box is what lets a founder see *their* reward rather than a
generic prize, without the row losing the gift language that ties it together.

Two rules these models live by:

1. **Authored in the opened box's own frame.** The box's mouth is at z = 0.88 with an interior of
   about +/-0.465, and the component renders box and contents in the same group with no offsets. So
   everything here is positioned as it will finally sit, not about its own origin.

2. **Inside the gem's envelope**: no higher than about z = 1.45, no wider than about +/-0.5.
   GIFT_EXTENT in RewardTimeline.tsx is a hand-tuned constant fitting the whole row at once, so a
   model that outgrows it does not get clipped — it silently shrinks every other gift in the row to
   make space for itself.

`level-two` is deliberately a generic two-storey block. The Level 2 premises do not exist yet, and
an icon that guessed at them would be a promise this repo cannot keep.
"""

from math import cos, pi, radians, sin
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "artwork/3d/v3/ui"
OUTPUT_DIR = ROOT / "public/assets/ui"

# The box's mouth, which every model here sits in or above.
MOUTH_Z = 0.88


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
        # Wider than the thinnest half-extent and the bevel self-intersects, silently collapsing the
        # face on export. These are small parts, so that limit bites often.
        modifier.width = min(bevel, min(scale) * 0.8)
        modifier.segments = 3 if modifier.width >= 0.04 else 2
    return obj


def cylinder(name, location, radius, depth, surface, vertices=14, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    return obj


def sphere(name, location, radius, surface, scale=(1, 1, 1), subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    return obj


def wire(name, points, radius, surface):
    """A swept tube along a polyline, for the garland's cable.

    A curve with a bevel depth rather than a chain of cylinders: aligning a cylinder to each segment
    means deriving a rotation from a direction vector for every one of them, and the joints still
    show. The curve sweeps a continuous tube and Blender handles the corners."""
    data = bpy.data.curves.new(f"{name} curve", type="CURVE")
    data.dimensions = "3D"
    data.fill_mode = "FULL"
    data.bevel_depth = radius
    data.bevel_resolution = 2
    spline = data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for index, (x, y, z) in enumerate(points):
        spline.points[index].co = (x, y, z, 1.0)
    data.materials.append(surface)

    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.select_all(action="DESELECT")
    return bpy.context.object


# --- The five models ------------------------------------------------------


def gem():
    """The fallback, for any earned rung whose reward has no model of its own — and for the
    placeholder rungs, which have no reward at all.

    One subdivision and flat shading is the whole point: twenty broad facets catch the light in flat
    planes and read as cut, where a smooth sphere reads as a pearl."""
    glow = material(
        "Reward gem",
        (1.0, 0.815, 0.320),
        roughness=0.34,
        emission=(1.0, 0.700, 0.190),
        emission_strength=0.9,
    )
    sphere("reward gem", (-0.10, -0.09, 1.03), 0.315, glow, scale=(0.94, 0.94, 1.18), subdivisions=1)
    return {"reward gem"}


def lights():
    """The roof lights in miniature: a festoon lifted out of the box, bulbs hanging under a swag.

    The cable arcs upward rather than drooping. A real garland sags, but one that sagged here would
    hang its bulbs down inside the box where nothing can see them."""
    cable = material("Garland cable", (0.105, 0.165, 0.145), roughness=0.86)
    # The roof lights' own palette, so the icon and the thing it stands for are lit the same way.
    bulbs = [
        material(f"Garland bulb {index}", color, roughness=0.28, emission=color, emission_strength=0.45)
        for index, color in enumerate((
            (1.0, 0.851, 0.541), (1.0, 0.545, 0.420), (0.549, 0.878, 0.722),
            (0.498, 0.831, 0.941), (1.0, 0.953, 0.784),
        ))
    ]

    # Narrower and forward of centre. At the full width of the box mouth the right half of the
    # swag disappeared behind the tipped lid, which rests back and to the right; and a lower arc
    # dropped its end bulbs below the rim, inside the box where nothing can see them.
    span, peak, base = 0.34, 1.40, 1.06
    centre_x, centre_y = -0.04, -0.10

    # A half-sine hump: level at the ends where the cable leaves the box, highest in the middle.
    arc = [
        (centre_x - span + 2 * span * t, centre_y, base + (peak - base) * sin(pi * t))
        for t in (index / 16 for index in range(17))
    ]
    wire("garland cable", arc, 0.022, cable)

    for index in range(5):
        t = (index + 0.5) / 5
        x = centre_x - span + 2 * span * t
        z = base + (peak - base) * sin(pi * t)
        cylinder(f"garland cap {index}", (x, centre_y, z - 0.055), 0.032, 0.055, cable, vertices=8)
        sphere(f"garland bulb {index}", (x, centre_y, z - 0.155), 0.082, bulbs[index], scale=(1, 1, 1.3))
    return set()


def marquee():
    """The scrolling billboard: a board on a post, with bars standing in for travelling text."""
    frame = material("Marquee frame", (0.545, 0.345, 0.145), roughness=0.68)
    face = material("Marquee face", (0.075, 0.235, 0.255), roughness=0.60)
    lit = material(
        "Marquee text", (1.0, 0.855, 0.470), roughness=0.35,
        emission=(1.0, 0.760, 0.290), emission_strength=1.15,
    )

    cylinder("marquee post", (0, 0, 0.99), 0.045, 0.30, frame, vertices=10)
    cube("marquee board", (0, 0, 1.255), (0.375, 0.055, 0.185), frame, 0.045)
    cube("marquee face", (0, -0.062, 1.255), (0.325, 0.020, 0.140), face, 0.03)
    # Three bars of unequal length, the way a station board reads mid-scroll.
    # Standing well clear of the face: at 0.004 of clearance only the centre bar survived the
    # face's own bevel, which curves away toward the edges.
    for x, width in ((-0.170, 0.105), (0.030, 0.070), (0.195, 0.050)):
        cube(f"marquee text {x}", (x, -0.098, 1.255), (width, 0.018, 0.036), lit, 0.014)
    return set()


def status():
    """The status bubble: a rounded speech bubble with a tail and three dots."""
    shell = material("Status bubble", (0.965, 0.925, 0.800), roughness=0.66)
    dot = material("Status dot", (0.075, 0.360, 0.355), roughness=0.55)

    cube("status bubble", (0, 0, 1.215), (0.330, 0.105, 0.215), shell, 0.13)
    # The tail, turned point-down so it reads as coming from the box rather than sitting on it.
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.105, depth=0.20, location=(-0.12, 0, 0.945), rotation=(0, 0, radians(45)))
    tail = bpy.context.object
    tail.name = "status tail"
    tail.data.materials.append(shell)

    # Pulled in and pushed forward. The bubble carries a 0.084 bevel, so its face falls away fast
    # toward the edges and dots set near them sink out of sight.
    for x in (-0.095, 0.0, 0.095):
        cylinder(f"status dot {x}", (x, -0.138, 1.215), 0.048, 0.040, dot, vertices=12, rotation=(radians(90), 0, 0))
    # Flat-shaded: the tail is four faces, and smoothing them turns a crisp point into a smear.
    return {"status tail"}


def level_two():
    """A bigger building. Generic on purpose — the Level 2 premises are not designed yet, so this
    says "an upgrade" without promising a particular one."""
    walls = material("Upgrade walls", (0.945, 0.895, 0.760), roughness=0.70)
    band = material("Upgrade band", (0.075, 0.360, 0.355), roughness=0.58)
    glass = material(
        "Upgrade glazing", (0.620, 0.855, 0.885), roughness=0.30,
        emission=(0.780, 0.930, 0.960), emission_strength=0.85,
    )

    cube("upgrade storey one", (0, 0, 1.000), (0.245, 0.245, 0.160), walls, 0.05)
    cube("upgrade floor band", (0, 0, 1.175), (0.265, 0.265, 0.028), band, 0.02)
    cube("upgrade storey two", (0, 0, 1.320), (0.195, 0.195, 0.130), walls, 0.05)
    cube("upgrade roof", (0, 0, 1.462), (0.225, 0.225, 0.030), band, 0.02)
    # A band across each storey's front, not a slot: at this size a tall narrow window on a
    # bevelled corner reads as a tab stuck to the side of the block.
    for z, half_depth, width in ((1.000, 0.245, 0.165), (1.320, 0.195, 0.130)):
        cube(f"upgrade glazing {z}", (0, -(half_depth + 0.014), z), (width, 0.020, 0.052), glass, 0.018)
    return set()


def export(name, flat):
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.name in flat:
            continue
        for polygon in obj.data.polygons:
            polygon.use_smooth = True

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_DIR / f"{name}.glb"),
        export_format="GLB",
        use_selection=True,
        export_materials="EXPORT",
        export_apply=True,
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_DIR / f"{name}.blend"))


def main():
    for name, build in (
        ("reward-content-gem", gem),
        ("reward-content-lights", lights),
        ("reward-content-marquee", marquee),
        ("reward-content-status", status),
        ("reward-content-level-two", level_two),
    ):
        bpy.ops.wm.read_homefile(use_empty=True)
        export(name, build())


main()
