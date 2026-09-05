"""The reward ladder's two icons: a wrapped gift, and the same gift opened.

One script, two exports. They are deliberately not separate scripts the way the city assets are,
because the whole read depends on them being the *same object* in two states — the open one has to
carry the identical box, ribbon and bow, or the strip looks like two unrelated presents rather than
one you have unwrapped. Sharing the builders is what guarantees that.

These are UI, not city furniture: they never stand on a plot, so they carry no ground pad and sit on
their own base at z = 0 for the strip to place them.
"""

from math import cos, radians, sin
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "artwork/3d/v3/ui"
OUTPUT_DIR = ROOT / "public/assets/ui"

# The box is a squat cube rather than a tall one: at strip size the icon is about 54px across, and a
# tall parcel reads as a crate. Wider than it is high is what says "gift".
BOX_HALF = 0.54
BOX_TOP = 0.88
# The lid oversails the box on every side, which is the single detail that stops a lidded cube from
# reading as one solid block.
LID_HALF = 0.585
LID_HALF_Z = 0.115
LID_MID_Z = 0.985

# Ribbon bands stand proud of both box and lid, so they cast their own silhouette against the sides.
RIBBON_HALF = 0.135
RIBBON_OUT = 0.605

KNOT_Z = 1.235


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
        # face on export — the ribbon bands and lid are thin enough for that to bite.
        modifier.width = min(bevel, min(scale) * 0.8)
        modifier.segments = 3 if modifier.width >= 0.04 else 2
    return obj


def torus(name, location, major_radius, minor_radius, surface, rotation=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=18,
        minor_segments=8,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    # Scale is applied in the object's own frame, before its rotation, so a loop standing up in the
    # XZ plane stretches along local X into a world-X ellipse. That ellipse is the difference
    # between a bow and two doughnuts.
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    return obj


def join(name, parts):
    """One object per gift keeps the strip at a couple of draw calls. Modifiers do not survive a
    join, so every bevel has to be baked first — the same order the street lamp uses."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    bpy.ops.object.select_all(action="DESELECT")
    return joined


def palette():
    return {
        # Two golds, light over dark: the lid catching more light than the box is what gives the
        # icon a top at this size, where a bevel highlight is barely a pixel.
        "box": material("Gift box gold", (0.855, 0.590, 0.215), roughness=0.62),
        "lid": material("Gift lid gold", (0.960, 0.735, 0.320), roughness=0.58),
        # The inside of an opened box, in shadow. Without it the open gift looks like a box with a
        # ball balanced on top rather than something with a hollow in it.
        "liner": material("Gift box liner", (0.470, 0.290, 0.105), roughness=0.86),
        "ribbon": material("Gift ribbon", (0.815, 0.245, 0.190), roughness=0.55),
        "ribbon_deep": material("Gift ribbon shadow", (0.610, 0.150, 0.120), roughness=0.60),
        # The reward itself, standing in for every unlock the ladder has yet to name. Strengths
        # above 1 survive the glTF export via KHR_materials_emissive_strength.
        "glow": material(
            "Gift reward glow",
            (1.0, 0.815, 0.320),
            roughness=0.34,
            emission=(1.0, 0.700, 0.190),
            emission_strength=0.9,
        ),
    }


def bow(surfaces, lid_top_z):
    """A knot with four loops splaying to the four sides, and two tails down the front.

    Four rather than the reference's two. A two-loop bow only reads as a bow from the one angle its
    loops face, and this icon is seen at a three-quarter yaw — from there a two-loop bow shows one
    loop wide open and the other edge-on, which looks like a broken link rather than a ribbon. Four
    loops read the same from any angle, which is how gift bows are actually tied.

    The loops are circles placed *along* their splay direction rather than rotated into it: a torus
    is symmetric about its axis, so only the ring's plane and centre matter, and offsetting the
    centre is both simpler and impossible to get subtly wrong."""
    knot_z = lid_top_z + 0.055
    parts = [cube("gift bow knot", (0, 0, knot_z + 0.02), (0.135, 0.135, 0.105), surfaces["ribbon"], 0.055)]

    # Out and up at about 22 degrees, so the loops sit beside the knot rather than towering over the
    # lid. Anything steeper and the bow becomes the icon.
    reach = 0.215
    out, up = cos(radians(22)), sin(radians(22))
    for index, (dx, dy) in enumerate(((-1, 0), (1, 0), (0, -1), (0, 1))):
        parts.append(torus(
            f"gift bow loop {index}",
            (dx * reach * out, dy * reach * out, knot_z + reach * up),
            0.155,
            0.076,
            surfaces["ribbon"],
            # Standing the ring up puts its normal horizontal and square to its own splay, so each
            # loop opens the way it points.
            rotation=(radians(90), 0, radians(90) if dy else 0),
            scale=(1.3, 0.92, 1.0),
        ))

    # Two tails down the front corner, the one place they are not hidden behind a loop.
    for side in (-1, 1):
        parts.append(cube(
            f"gift bow tail {'left' if side < 0 else 'right'}",
            (side * 0.20, -0.20, knot_z - 0.16),
            (0.068, 0.050, 0.175),
            surfaces["ribbon_deep"],
            0.03,
            rotation=(radians(-16), radians(side * 26), 0),
        ))
    return parts


def sealed(surfaces):
    parts = [
        cube("gift box", (0, 0, BOX_TOP / 2), (BOX_HALF, BOX_HALF, BOX_TOP / 2), surfaces["box"], 0.07),
        cube("gift lid", (0, 0, LID_MID_Z), (LID_HALF, LID_HALF, LID_HALF_Z), surfaces["lid"], 0.05),
    ]
    # One band per axis, running the full height from the ground to just over the lid, so the wrap
    # is continuous rather than three disconnected stripes.
    band_top = LID_MID_Z + LID_HALF_Z + 0.03
    for axis, name in ((0, "gift ribbon band across"), (1, "gift ribbon band along")):
        half = [RIBBON_HALF, RIBBON_HALF]
        half[axis] = RIBBON_OUT
        parts.append(cube(name, (0, 0, band_top / 2), (*half, band_top / 2), surfaces["ribbon"], 0.03))
    parts.extend(bow(surfaces, LID_MID_Z + LID_HALF_Z))
    return join("reward gift sealed", parts)


def opened(surfaces):
    """The box hollowed out, the lid tipped off it, and the reward rising out.

    The walls are four separate slabs rather than a cube with a boolean: the strip renders this at
    about 54px, where a booleaned rim costs geometry nobody can see, and four slabs cannot fail the
    way a boolean on a bevelled cube can."""
    wall = 0.075
    inner = BOX_HALF - wall
    parts = [
        cube("gift box floor", (0, 0, 0.06), (BOX_HALF, BOX_HALF, 0.06), surfaces["box"], 0.05),
        cube("gift box liner", (0, 0, BOX_TOP / 2), (inner, inner, BOX_TOP / 2 - 0.02), surfaces["liner"]),
    ]
    for axis in (0, 1):
        for side in (-1, 1):
            location = [0, 0, BOX_TOP / 2]
            location[axis] = side * (BOX_HALF - wall / 2)
            half = [BOX_HALF, BOX_HALF, BOX_TOP / 2]
            half[axis] = wall / 2
            parts.append(cube(f"gift box wall {axis}{side}", location, half, surfaces["box"], 0.05))

    band_top = BOX_TOP + 0.03
    for axis, name in ((0, "gift ribbon band across"), (1, "gift ribbon band along")):
        half = [RIBBON_HALF, RIBBON_HALF]
        half[axis] = BOX_HALF + 0.045
        parts.append(cube(name, (0, 0, band_top / 2), (*half, band_top / 2), surfaces["ribbon"], 0.03))

    box = join("reward gift opened", parts)

    # Nothing is placed in the mouth here. What rises out of an opened box is the reward itself,
    # and those are built by build-reward-contents.py so the box stays one model whichever rung it
    # belongs to.

    # The lid tipped off and leaning on the box's back corner, bow and all. Built flat about its own
    # origin and moved as one piece, which is the only way the bow stays seated on it.
    lid_parts = [cube("gift lid", (0, 0, 0), (LID_HALF, LID_HALF, LID_HALF_Z), surfaces["lid"], 0.05)]
    lid_parts.extend(bow(surfaces, LID_HALF_Z))
    lid = join("reward gift lid", lid_parts)
    lid.rotation_euler = (radians(-5), radians(24), radians(-18))
    # Resting on the back-right rim rather than thrown clear. A lid flung off to the side widens
    # the silhouette by half again, and the strip fits the whole icon into about 54px — every unit
    # the lid travels is a unit the box itself has to shrink by.
    lid.location = (0.52, 0.40, 0.94)
    return box, lid


def export(name):
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
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
    for name, build in (("reward-gift-sealed", sealed), ("reward-gift-opened", opened)):
        bpy.ops.wm.read_homefile(use_empty=True)
        build(palette())
        export(name)


main()
