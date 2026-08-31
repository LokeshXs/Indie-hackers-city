from math import cos, radians, sin
from pathlib import Path

import bpy


# Nested a level deeper than the flat build scripts, so the repo root is parents[2].
ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/landmarks/district-sign-gantry.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/landmarks/district-sign-gantry.glb"

# Change these together to mint the gantry for a second district.
LINES = ("PIONEER", "DISTRICT")
TEXT_FIT_WIDTH = 12.9
TEXT_FIT_HEIGHT = 2.50
LINE_GAP = 0.22
# The name proper carries the board; the second line is set smaller so the two rows read as a
# hierarchy rather than as two equal-weight bands. Each line is its own text object because a
# single multi-line one can only be fitted as one block.
SECONDARY_LINE_SCALE = 0.62
PRIMARY_LINE_HEIGHT = (TEXT_FIT_HEIGHT - LINE_GAP) / (1 + SECONDARY_LINE_SCALE)
SECONDARY_LINE_HEIGHT = PRIMARY_LINE_HEIGHT * SECONDARY_LINE_SCALE

# Pillars stand in the four diagonal pockets around the roundabout, which are bounded by the ring
# at r = 9.5 and by the four avenue arms, all of which begin at |along| = 8.4. The binding
# constraint is the widest piece -- the footing pad -- not the pillar centre: at offset 7.6 the
# 0.75 pad reaches 8.35 (0.05 clear of the verge) and its inner edge sits at r = 10.0.
PILLAR_OFFSET = 7.6
PAD_RADIUS = 0.75
BOARD_CENTRE_Z = 4.90
# Outward surface of the navy panel; the lettering plane sits exactly on it.
BOARD_FACE_Y = -7.83

LETTERING_NAME = "district sign lettering"


def material(name, color, roughness=0.72, metallic=0.0):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
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
    bevel.width = min(0.045, radius * 0.5, depth * 0.4)
    bevel.segments = 2
    return obj


def place(x, y, z, yaw):
    """Rotates a canonical (-Y facing) coordinate onto the side at `yaw` radians about Z."""
    c, s = cos(yaw), sin(yaw)
    return (x * c - y * s, x * s + y * c, z)


def raised_lettering(body, yaw, target_height, surface):
    """One line of the district name, laid on a board's outward face as real raised geometry.
    Returns the object and the height it actually came out at, which is what the caller stacks."""
    # convert() below acts on the selection and applies modifiers on whatever it catches, so the
    # already-built slabs must not be selected when it runs.
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.object.text_add()
    obj = bpy.context.object
    obj.name = LETTERING_NAME
    data = obj.data
    data.body = body
    data.align_x = "CENTER"
    data.align_y = "CENTER"
    # The board is far wider than it is tall, so the type is tracked out to fill the span rather
    # than sitting as a small clump in the middle.
    data.space_character = 1.9
    # Faux-bold. Blender's built-in font is far too thin to hold up at city zoom, and offset
    # fattens the glyph outlines instead of needing a vendored bold font file.
    data.offset = 0.03
    data.extrude = 0.07
    # A chamfer here is invisible at city zoom but quadruples the glyph triangle count
    # (2508 polys vs 548 measured), so the letters keep hard extrusion walls instead.
    data.bevel_depth = 0.0
    # Default 12 is far more curve detail than a glyph this small on screen can ever show.
    data.resolution_u = 3
    data.materials.append(surface)

    # A FONT object is not a MESH: the smooth-shading pass filters on obj.type, and the exporter
    # will not turn curve data into geometry on its own.
    bpy.ops.object.convert(target="MESH")

    # Fit by measuring the built glyphs, not by guessing the font's metrics.
    width, height, _ = obj.dimensions
    fit = min(TEXT_FIT_WIDTH / width, target_height / height)
    # Z is left alone so the raised relief keeps its absolute depth whatever the fit works out to.
    obj.scale = (fit, fit, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Tracking adds an advance after the final glyph, which biases align_x. Re-centring on the
    # actual bounds is what makes the block sit dead centre on the board.
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    # Read the height back before rotating: a long line can be width-limited rather than
    # height-limited, and the caller needs the real height to stack the two rows.
    actual_height = obj.dimensions[1]

    # Text is authored in local XY facing +Z; +90 degrees about X points it at -Y, then yaw.
    obj.rotation_euler = (radians(90), 0, yaw)
    return obj, actual_height


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    paving = material("Sign pad paving", (0.48, 0.51, 0.53), roughness=0.82)
    concrete = material("Sign footing concrete", (0.46, 0.52, 0.54))
    navy = material("District sign navy", (0.03, 0.15, 0.25))
    aqua = material("District sign trim", (0.05, 0.55, 0.58))
    steel = material("District sign steel", (0.34, 0.40, 0.42), roughness=0.34, metallic=0.45)
    cream = material("District sign lettering", (0.97, 0.88, 0.65))

    # Four shared pillars, one at each diagonal corner. Each carries two boards, which is why the
    # whole gantry is a single asset rather than four separately placed two-leg spans.
    for x in (-PILLAR_OFFSET, PILLAR_OFFSET):
        for y in (-PILLAR_OFFSET, PILLAR_OFFSET):
            # The diagonal pocket is bare map-base grey, so each pillar brings its own paving.
            cylinder("sign pillar pad", (x, y, 0.07), PAD_RADIUS, 0.14, paving, 24)
            cylinder("sign pillar foot", (x, y, 0.32), 0.55, 0.36, concrete, 20)
            cylinder("sign pillar shaft", (x, y, 3.65), 0.30, 6.70, navy, 16)
            for z in (3.32, 6.48):
                cylinder("sign pillar collar", (x, y, z), 0.40, 0.20, steel, 16)
            cylinder("sign pillar cap", (x, y, 7.10), 0.36, 0.20, aqua, 16)

    # One full-width board per side, spanning pillar to pillar and facing outward. The slab is
    # navy all the way round so the two boards the camera sees from behind read as sign backs
    # rather than bright panels; the aqua only shows as a border around the lettered face.
    for degrees in (0, 90, 180, 270):
        yaw = radians(degrees)
        cube("district board back", place(0, -7.54, BOARD_CENTRE_Z, yaw), (7.50, 0.10, 1.66), navy, 0.06, (0, 0, yaw))
        cube("district board trim", place(0, -7.685, BOARD_CENTRE_Z, yaw), (7.50, 0.045, 1.66), aqua, 0.03, (0, 0, yaw))
        cube("district board face", place(0, -7.78, BOARD_CENTRE_Z, yaw), (7.26, 0.05, 1.42), navy, 0.045, (0, 0, yaw))

        primary, primary_height = raised_lettering(LINES[0], yaw, PRIMARY_LINE_HEIGHT, cream)
        secondary, secondary_height = raised_lettering(LINES[1], yaw, SECONDARY_LINE_HEIGHT, cream)
        # Stack from the measured heights so the pair stays centred on the board even when a line
        # ends up width-limited and comes out shorter than it asked for.
        top = BOARD_CENTRE_Z + (primary_height + LINE_GAP + secondary_height) / 2
        primary.location = place(0.0, BOARD_FACE_Y, top - primary_height / 2, yaw)
        secondary.location = place(0.0, BOARD_FACE_Y, top - primary_height - LINE_GAP - secondary_height / 2, yaw)

    # The soft, rounded read of the whole kit comes from this pass. The lettering is deliberately
    # left flat-shaded: smoothing across a glyph's face-to-side edge blurs the letterforms.
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and not obj.name.startswith(LETTERING_NAME):
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
