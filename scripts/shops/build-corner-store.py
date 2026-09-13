"""The corner store on Jobs Avenue's shore side: the district's second building owned by nobody.

Like the Coffee House this is scenery -- no plot id, no database row, and the plot beneath it is
marked inactive so it is never offered to a founder.

Three notes carried over from the Coffee House, because they cost a rebuild each the first time:

COLOURS ARE PRE-ATTENUATED, NOT COPIED. The reference is a flat vector illustration, so its colours
are a FINAL APPEARANCE, not base colours. Converted sRGB -> linear and authored straight in, they
come out about a stop hot under the city rig (hemisphere 1.35 + directional 2.65, no ambient, lit
face gain about 2x) and ACES then rolls the brightest channels toward white -- which on this
building would cost exactly the vibrancy that is the point of it. The sampled linear value is given
beside each one that has been pulled back, so the two can be compared.

THE FOOTPRINT IS THE PLOT. The paving is cut to the pad's exact rectangle; anything that projects
past it -- awning, coping, sign -- hangs over the neighbouring grass. The awnings and the pole sign
are what set the edges here, so the walls are sized backwards from them.

FRONT IS +Y, AND THE VIEWER'S LEFT IS +X. Standing out front looking at the shop, +X is on the
left. The reference puts the pole sign on the viewer's left, so it sits at POSITIVE x.
"""

from math import cos, radians, sin
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/shops/corner-store.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/shops/corner-store.glb"

# The plot, in this model's own authored units. The pad is 11.4 x 10.3 world and every building on
# it is placed 1.24 world units back from the pad centre, so at the placement scale of 1.4 the pad
# centre sits 0.886 FORWARD of this model's origin.
PLOT_HALF_X = 5.70 / 1.4
PLOT_HALF_Y = 5.15 / 1.4
PLOT_CENTRE_Y = 1.24 / 1.4
PLOT_BACK = PLOT_CENTRE_Y - PLOT_HALF_Y
PLOT_FRONT = PLOT_CENTRE_Y + PLOT_HALF_Y
# The pad's grass tops out at 0.107 world (0.076 here) with mowing stripes above it, so the slab's
# top must clear that; its soil skirt is the only part reaching the full rectangle and only to 0.070
# world (0.050 here), so the slab's underside must start above THAT or the two share a vertical face
# along the plot edge and z-fight along it.
PAVING_BASE = 0.055
PAVING_TOP = 0.10

WALL_X = 3.00
WALL_BACK = -2.62
WALL_FRONT = 2.55
COPING_OVER = 0.12          # how far the orange cap oversails the wall below it
PODIUM_TOP = 0.34
KICK_TOP = 0.50             # the grey kickplate the glazing stands on
GLASS_TOP = 2.42
FASCIA_LOW = 2.85
FASCIA_TOP = 3.95
COPING_TOP = 4.30
ROOF_DECK = 4.04          # the deck sits inside the coping rim, not under it

AWNING_RADIUS = 0.33
AWNING_Z = 2.52
AWNING_OUT = 0.20           # how far the barrel's axis stands off the wall
AWNING_REACH = AWNING_OUT + AWNING_RADIUS

# The window stripe band: orange over green over red, each on a white backing that shows through
# as the gaps between them.
STRIPE_BANDS = ((1.48, 1.54, "orange"), (1.39, 1.45, "green"), (1.30, 1.36, "red"))
STRIPE_BACK = (1.26, 1.58)

# The entrance bay on the front elevation, in that wall's own frame.
DOOR_A0, DOOR_A1 = 0.62, 1.82

LETTERING_NAME = "corner store lettering"

# Face yaws. 0 faces +Y; the plate's outward normal is (-sin yaw, cos yaw), so -90 faces +X.
FACE_FRONT, FACE_EAST, FACE_WEST = 0.0, radians(-90), radians(90)


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
    """A box given as HALF-EXTENTS, matching the rest of the kit. Half-extents are LOCAL, so a
    rotated box is still described in its own frame."""
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new("Rounded toy edge", "BEVEL")
        # A bevel wider than the thinnest half-extent self-intersects and the face silently
        # collapses on export, so thin trim is trimmed back to a width it can carry.
        modifier.width = min(bevel, min(scale) * 0.8)
        modifier.segments = 3 if modifier.width >= 0.04 else 2
    return obj


def box(name, x0, x1, y0, y1, z0, z1, surface, bevel=0.0):
    return cube(name, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
                ((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), surface, bevel)


def cylinder(name, location, radius, depth, surface, vertices=20, rotation=(0, 0, 0), bevel=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new("Soft cylinder edge", "BEVEL")
        modifier.width = min(0.045, radius * 0.5, depth * 0.4)
        modifier.segments = 2
    return obj


def on_face(origin, yaw, across, out, up):
    """A point given in a wall's own frame -- `across` to the viewer's right as they face the wall,
    `out` away from it, `up` -- placed in world space.

    `across` runs to world -X at yaw 0, which looks backwards written down and is not. Standing out
    front at +Y looking at the shop, the viewer's LEFT is +X, so their left-to-right is -X. This has
    to match raised_lettering, whose (90, 0, 180 + yaw) sends its own text axis the same way: with
    the two disagreeing the type reads correctly and every mark built from boxes comes out
    mirrored, which is exactly what happened here."""
    c, s = cos(yaw), sin(yaw)
    return (origin[0] - across * c - out * s,
            origin[1] - across * s + out * c,
            origin[2] + up)


def face_box(name, origin, yaw, a0, a1, o0, o1, u0, u1, surface, bevel=0.0, tilt=0.0):
    """A box stated in a wall's frame. `tilt` leans it within the wall plane, which is what the
    diagonal stroke of the numeral needs. A POSITIVE tilt leans its head toward the reading-left,
    because the box's own local axis runs opposite to `across` -- see on_face."""
    centre = on_face(origin, yaw, (a0 + a1) / 2, (o0 + o1) / 2, (u0 + u1) / 2)
    return cube(name, centre, ((a1 - a0) / 2, (o1 - o0) / 2, (u1 - u0) / 2), surface, bevel,
                rotation=(0, tilt, yaw))


def raised_lettering(body, surface, fit_width, fit_height, yaw=0.0,
                     weight=0.024, relief=0.03, spacing=1.02):
    """Raised type as real geometry.

    From the Coffee House, where the load-bearing parts were all counter-intuitive: convert() acts
    on the selection so nothing else may be selected; the built-in font is too light to hold up at
    city zoom so `weight` grows the outline to fake a bold; and the fit is measured off the built
    glyphs rather than trusted from font metrics."""
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.object.text_add()
    obj = bpy.context.object
    obj.name = LETTERING_NAME
    data = obj.data
    data.body = body
    data.align_x = "CENTER"
    data.align_y = "CENTER"
    data.space_character = spacing
    data.offset = weight
    data.extrude = relief
    data.bevel_depth = 0.0          # a chamfer is invisible at city zoom and quadruples the tris
    data.resolution_u = 3
    data.materials.append(surface)
    # A FONT object is not a MESH: the exporter will not turn curve data into geometry on its own,
    # and the smooth-shading pass filters on obj.type.
    bpy.ops.object.convert(target="MESH")

    width, height, _ = obj.dimensions
    fit = min(fit_width / width, fit_height / height)
    obj.scale = (fit, fit, 1.0)     # Z left alone so the relief keeps its absolute depth
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Tracking adds an advance after the last glyph, which biases align_x; re-centring on the real
    # bounds is what puts the block dead centre.
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    # Authored in local XY facing +Z. X+90 turns the face to -Y; Z then swings it to the wall.
    obj.rotation_euler = (radians(90), 0, radians(180) + yaw)
    return obj


def store_mark(origin, yaw, height, red, green, white, panel=True):
    """The store's mark: a bold angular numeral with the word set across its foot.

    Modelled rather than typed. The numeral is a distinctive display form -- a heavy horizontal bar
    over a raked stroke -- and no glyph in the built-in font is close enough that scaling one would
    pass; two boxes are both nearer and cheaper."""
    unit = height
    if panel:
        face_box("store mark panel", origin, yaw, -0.62 * unit, 0.62 * unit,
                 0.0, 0.035 * unit, -0.70 * unit, 0.70 * unit, white, 0.01 * unit)
    out = 0.035 * unit if panel else 0.0
    # The bar, then the raked stroke hung off its right end.
    # A SHORT bar, and a heavy stroke that runs the full height of the panel. The proportions are
    # the whole character of this mark: a long bar with a stroke stopping above the word reads as a
    # generic numeral, where the real one is mostly stroke, with the bar a stub at its head.
    face_box("store mark bar", origin, yaw, -0.42 * unit, 0.30 * unit,
             out, out + 0.05 * unit, 0.34 * unit, 0.56 * unit, red)
    face_box("store mark stroke", origin, yaw, -0.11 * unit, 0.23 * unit,
             out, out + 0.05 * unit, -0.62 * unit, 0.50 * unit, red, tilt=radians(-23))
    # The word crosses the stroke rather than sitting under it, which is what makes the two read as
    # one mark instead of a numeral with a caption.
    word = raised_lettering("ELEVEN", green, 0.92 * unit, 0.19 * unit, yaw=yaw,
                            weight=0.03, relief=0.012 * unit, spacing=1.10)
    word.location = on_face(origin, yaw, 0.0, out + 0.055 * unit, -0.16 * unit)
    return word


def barrel_awning(name, origin, yaw, half_length, surface):
    """A ribbed barrel canopy. The cylinder's own facets ARE the corrugations -- it is left out of
    the smooth-shading pass on purpose, which is the whole reason it reads as ribbed metal rather
    than as a plastic tube."""
    axis = (0, radians(90), yaw)
    centre = on_face(origin, yaw, 0.0, AWNING_OUT, 0.0)
    barrel = cylinder(name, centre, AWNING_RADIUS, half_length * 2, surface, vertices=24,
                      rotation=axis, bevel=False)
    ribs = max(4, int(half_length * 2 / 0.30))
    for index in range(1, ribs):
        along = -half_length + half_length * 2 * index / ribs
        cylinder(f"{name} rib", on_face(origin, yaw, along, AWNING_OUT, 0.0),
                 AWNING_RADIUS + 0.014, 0.055, surface, vertices=24, rotation=axis, bevel=False)
    return barrel


def seat_on_plot():
    """Square the store on its plot and pull it back to the plot's rear edge.

    Two corrections, both measured off real geometry. Across X the pole sign sits on one side only,
    so the geometric centre is not the origin -- and a city entity is placed BY its origin, so an
    uncorrected model sits visibly off-centre on its pad. Along Y the shared placement sets every
    building 1.24 world units back from the pad centre, which for this footprint would hang the
    rear wall over the ground behind. Bevels only cut inward, so object bounds stand in safely for
    the exported geometry."""
    xs, ys = [], []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            xs.append(world.x)
            ys.append(world.y)
    shift = Vector(((min(xs) + max(xs)) / -2, PLOT_BACK + 0.05 - min(ys), 0.0))
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.location += shift
    return shift


def merge_by_material():
    """Collapse the scene to one mesh per material, for export only.

    Authored as hundreds of separate boxes, which is the right way to build it and the wrong way to
    ship it: every box costs a node, a mesh and its own accessors in the glb, and a draw call at
    runtime. Modifiers are applied first because join() keeps only the active object's stack, so
    every other bevel would be silently dropped; and it runs after the smooth-shading pass, whose
    flags are per polygon and survive the join."""
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    groups = {}
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and obj.data.materials:
            groups.setdefault(obj.data.materials[0].name, []).append(obj)
    for name, members in groups.items():
        if len(members) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in members:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = members[0]
        bpy.ops.object.join()
        bpy.context.object.name = name


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    # --- Palette. Sampled off the reference and converted sRGB -> linear; the bright ones are then
    # pulled back, because the reference is flat artwork and the city rig doubles a lit face. ---
    orange = material("Seven Eleven orange", (0.580, 0.150, 0.024))        # from (0.863, 0.238, 0.040)
    orange_lit = material("Seven Eleven orange cap", (0.660, 0.185, 0.032))
    green = material("Seven Eleven green", (0.010, 0.105, 0.038))          # from (0.007, 0.114, 0.040)
    red = material("Seven Eleven red", (0.330, 0.022, 0.024))              # from (0.423, 0.027, 0.030)
    white = material("Seven Eleven white", (0.720, 0.730, 0.720))          # from (0.905, 0.913, 0.905)
    charcoal = material("Seven Eleven charcoal", (0.030, 0.030, 0.032), roughness=0.55)
    mullion = material("Seven Eleven mullion", (0.016, 0.022, 0.020), roughness=0.5)
    # The barrel canopies. Metallic enough to catch the sun along the ribs, which is what separates
    # them from the grey posts they sit on.
    silver = material("Seven Eleven canopy", (0.430, 0.445, 0.460), roughness=0.34, metallic=0.45)
    post = material("Seven Eleven post", (0.400, 0.412, 0.424), roughness=0.62)
    deck = material("Seven Eleven roof deck", (0.300, 0.306, 0.312), roughness=0.85)
    podium = material("Seven Eleven podium", (0.400, 0.300, 0.215))        # from (0.479, 0.361, 0.262)
    paving = material("Cool grey paving", (0.48, 0.51, 0.53), roughness=0.85)
    paving_joint = material("Cool grey paving joint", (0.36, 0.39, 0.41), roughness=0.88)
    # Glazing. Ships lit at noon -- a shop window with the lights on is the one thing that reads
    # through the canopy's shadow -- and the night table walks it round to a warmer interior.
    glass = material("Seven Eleven glazing", (0.190, 0.325, 0.455), roughness=0.22, metallic=0.10,
                     emission=(0.110, 0.170, 0.225), emission_strength=0.8)
    # The signage. These are the surfaces the brief is about: they ship lit and the night table
    # pushes them hard, so they are authored dimmer than they will ever be seen.
    sign_face = material("Seven Eleven sign face", (0.700, 0.712, 0.700), roughness=0.35,
                         emission=(0.560, 0.570, 0.550), emission_strength=1.0)
    logo_red = material("Seven Eleven logo red", (0.470, 0.028, 0.036), roughness=0.40,
                        emission=(0.340, 0.020, 0.026), emission_strength=0.9)
    logo_green = material("Seven Eleven logo green", (0.014, 0.130, 0.048), roughness=0.40,
                          emission=(0.012, 0.105, 0.040), emission_strength=0.9)

    # --- The shell. Solid mass: the glazing is dark enough from outside that a modelled interior
    # would never be seen through it. ---
    box("store mass", -WALL_X, WALL_X, WALL_BACK, WALL_FRONT, PODIUM_TOP, FASCIA_LOW, white, 0.04)
    box("store kickplate", -WALL_X - 0.03, WALL_X + 0.03, WALL_BACK, WALL_FRONT + 0.03,
        PODIUM_TOP, KICK_TOP, post, 0.03)
    # Corner posts, stopping the glazing short of each corner the way the reference does.
    for px in (-WALL_X, WALL_X):
        for py in (WALL_BACK, WALL_FRONT):
            box("store corner post", px - 0.15, px + 0.15, py - 0.15, py + 0.15,
                PODIUM_TOP, FASCIA_LOW, post, 0.04)

    # --- Glazing on the front and both flanks; the back is solid service wall. ---
    GLAZED = (("front", FACE_FRONT, WALL_X - 0.15, (0.0, WALL_FRONT)),
              ("east", FACE_EAST, WALL_FRONT - 0.15, (WALL_X, 0.0)),
              ("west", FACE_WEST, WALL_FRONT - 0.15, (-WALL_X, 0.0)))
    for name, yaw, half, (ox, oy) in GLAZED:
        wall = (ox, oy, 0.0)
        box_span = half - 0.15
        face_box(f"store {name} glass", wall, yaw, -box_span, box_span, -0.02, 0.04,
                 KICK_TOP, GLASS_TOP, glass)
        # Mullions: three bays a side.
        for share in (-1 / 3, 1 / 3):
            seam = box_span * 2 * share
            face_box(f"store {name} mullion", wall, yaw, seam - 0.045, seam + 0.045,
                     -0.02, 0.06, KICK_TOP, GLASS_TOP, mullion)
        for edge in (-box_span, box_span):
            face_box(f"store {name} jamb", wall, yaw, edge - 0.05, edge + 0.05,
                     -0.02, 0.06, KICK_TOP, GLASS_TOP, mullion)
        face_box(f"store {name} head", wall, yaw, -box_span - 0.05, box_span + 0.05,
                 -0.02, 0.07, GLASS_TOP - 0.09, GLASS_TOP, mullion)
        # The stripe band, on a white backing that shows through as the gaps between the colours.
        face_box(f"store {name} stripe backing", wall, yaw, -box_span, box_span, 0.04, 0.06,
                 STRIPE_BACK[0], STRIPE_BACK[1], white)
        for low, high, tone in STRIPE_BANDS:
            face_box(f"store {name} stripe", wall, yaw, -box_span, box_span, 0.06, 0.08,
                     low, high, {"orange": orange, "green": green, "red": red}[tone])

    # --- The door. Everything here is placed through on_face from the wall origin, including the
    # decal and the pull: those two were carrying WORLD x positions from before on_face changed
    # handedness, which put them on the far side of the elevation, stranded on a window pane. ---
    wall_front = (0.0, WALL_FRONT, 0.0)
    door_mid = (DOOR_A0 + DOOR_A1) / 2
    face_box("store door frame", wall_front, FACE_FRONT, DOOR_A0, DOOR_A1, 0.04, 0.12,
             PODIUM_TOP, GLASS_TOP, mullion, 0.02)
    face_box("store door leaf", wall_front, FACE_FRONT, DOOR_A0 + 0.08, DOOR_A1 - 0.08, 0.10, 0.15,
             PODIUM_TOP + 0.04, 2.22, glass)
    # A transom over the door, which is what stops it reading as one more window bay.
    face_box("store door transom", wall_front, FACE_FRONT, DOOR_A0, DOOR_A1, 0.06, 0.14,
             2.22, 2.30, mullion)
    face_box("store door fanlight", wall_front, FACE_FRONT, DOOR_A0 + 0.08, DOOR_A1 - 0.08,
             0.10, 0.15, 2.30, GLASS_TOP - 0.04, glass)
    # The door carries one thick green band where the windows carry three thin stripes, at the same
    # height so the frontage still reads as one line across.
    face_box("store door band", wall_front, FACE_FRONT, DOOR_A0 + 0.08, DOOR_A1 - 0.08, 0.15, 0.17,
             1.32, 1.52, green)
    face_box("store door band edge", wall_front, FACE_FRONT, DOOR_A0 + 0.08, DOOR_A1 - 0.08,
             0.15, 0.17, 1.24, 1.30, red)
    # The mark on the glass, at the size the reference gives it -- about half the door's width,
    # not the sticker it was.
    store_mark(on_face(wall_front, FACE_FRONT, door_mid, 0.16, 1.90), FACE_FRONT, 0.42,
               logo_red, logo_green, white, panel=False)
    cylinder("store door pull", on_face(wall_front, FACE_FRONT, DOOR_A1 - 0.22, 0.21, 1.30),
             0.022, 0.50, charcoal, 10)

    # --- Barrel canopies, wrapping the front and both flanks. ---
    barrel_awning("store front canopy", (0.0, WALL_FRONT, AWNING_Z), FACE_FRONT, WALL_X + 0.10, silver)
    barrel_awning("store east canopy", (WALL_X, 0.0, AWNING_Z), FACE_EAST,
                  (WALL_FRONT - WALL_BACK) / 2 + 0.10, silver)
    barrel_awning("store west canopy", (-WALL_X, 0.0, AWNING_Z), FACE_WEST,
                  (WALL_FRONT - WALL_BACK) / 2 + 0.10, silver)
    # Rounded elbows where they meet, so the corner does not read as two tubes crossing.
    for cx in (-WALL_X, WALL_X):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=AWNING_RADIUS,
                                             location=(cx, WALL_FRONT, AWNING_Z))
        elbow = bpy.context.object
        elbow.name = "store canopy elbow"
        elbow.data.materials.append(silver)

    # --- The fascia: a banded parapet wrapping every elevation. ---
    BANDS = ((FASCIA_LOW, 3.06, red), (3.06, 3.09, white), (3.09, 3.66, green),
             (3.66, 3.69, white), (3.69, 3.90, orange), (3.90, FASCIA_TOP, green))
    for index, (low, high, tone) in enumerate(BANDS):
        box(f"store fascia band {index}", -WALL_X - 0.02, WALL_X + 0.02,
            WALL_BACK - 0.02, WALL_FRONT + 0.02, low, high, tone)
    # Panel joints, so the parapet reads as fitted sign panels rather than painted concrete.
    for jx in (-1.90, -0.64, 0.64, 1.90):
        for jy in (WALL_BACK - 0.03, WALL_FRONT + 0.03):
            box("store fascia joint", jx - 0.035, jx + 0.035, jy - 0.015, jy + 0.015,
                FASCIA_LOW, FASCIA_TOP, charcoal)
    for jy in (-1.50, 0.0, 1.50):
        for jx in (-WALL_X - 0.03, WALL_X + 0.03):
            box("store fascia joint", jx - 0.015, jx + 0.015, jy - 0.035, jy + 0.035,
                FASCIA_LOW, FASCIA_TOP, charcoal)

    # The mark, on the front and both flanks, so it reads from any orbit angle.
    for yaw, ox, oy in ((FACE_FRONT, 0.0, WALL_FRONT + 0.02), (FACE_EAST, WALL_X + 0.02, 0.0),
                        (FACE_WEST, -WALL_X - 0.02, 0.0)):
        store_mark((ox, oy, (FASCIA_LOW + FASCIA_TOP) / 2), yaw, 0.74, logo_red, logo_green, sign_face)

    # --- Orange coping, oversailing, with the grey deck sitting down inside it. ---
    box("store roof deck", -WALL_X - 0.02, WALL_X + 0.02, WALL_BACK - 0.02, WALL_FRONT + 0.02,
        FASCIA_TOP - 0.03, ROOF_DECK, deck, 0.03)
    for name, x0, x1, y0, y1 in (
        ("coping front", -WALL_X - COPING_OVER, WALL_X + COPING_OVER,
         WALL_FRONT - 0.12, WALL_FRONT + COPING_OVER),
        ("coping back", -WALL_X - COPING_OVER, WALL_X + COPING_OVER,
         WALL_BACK - COPING_OVER, WALL_BACK + 0.12),
        ("coping east", WALL_X - 0.12, WALL_X + COPING_OVER,
         WALL_BACK - COPING_OVER, WALL_FRONT + COPING_OVER),
        ("coping west", -WALL_X - COPING_OVER, -WALL_X + 0.12,
         WALL_BACK - COPING_OVER, WALL_FRONT + COPING_OVER),
    ):
        box(f"store {name}", x0, x1, y0, y1, FASCIA_TOP, COPING_TOP, orange_lit, 0.05)

    # --- The podium the store stands on, and the pole sign out front. ---
    box("store podium", -WALL_X - 0.30, WALL_X + 0.30, PLOT_BACK + 0.05, WALL_FRONT + 0.30,
        PAVING_TOP, PODIUM_TOP, podium, 0.05)

    sign_x, sign_y = 3.05, 3.55
    cube("sign footing", (sign_x, sign_y, PAVING_TOP + 0.16), (0.26, 0.26, 0.16), charcoal, 0.05)
    box("sign post", sign_x - 0.075, sign_x + 0.075, sign_y - 0.075, sign_y + 0.075,
        PAVING_TOP, 3.40, charcoal, 0.02)
    box("sign cabinet", sign_x - 0.72, sign_x + 0.72, sign_y - 0.10, sign_y + 0.10,
        3.30, 4.36, charcoal, 0.05)
    for facing, oy in ((FACE_FRONT, sign_y + 0.10), (radians(180), sign_y - 0.10)):
        face_box("sign green field", (sign_x, oy, 0.0), facing, -0.64, 0.64, 0.0, 0.03,
                 3.38, 4.28, green)
        store_mark((sign_x, oy + 0.03, 3.83), facing, 0.76, logo_red, logo_green, sign_face)

    # The soft, rounded read of the whole kit comes from this pass. The lettering stays flat --
    # smoothing across a glyph's face-to-side edge blurs the letterforms -- and so do the canopies,
    # whose facets are doing the work of corrugations.
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        if obj.name.startswith(LETTERING_NAME) or "canopy" in obj.name:
            continue
        for polygon in obj.data.polygons:
            polygon.use_smooth = True

    shift = seat_on_plot()

    # --- The forecourt: the whole plot, paved, laid after the shift because it lines up with the
    # pad rather than with the building. ---
    box("store forecourt", -PLOT_HALF_X, PLOT_HALF_X, PLOT_BACK, PLOT_FRONT,
        PAVING_BASE, PAVING_TOP, paving, 0.03)
    for index in range(1, 6):
        seam = -PLOT_HALF_X + 2 * PLOT_HALF_X * index / 6
        box("forecourt joint", seam - 0.015, seam + 0.015, PLOT_BACK, PLOT_FRONT,
            PAVING_TOP - 0.004, PAVING_TOP + 0.004, paving_joint)
    for index in range(1, 5):
        seam = PLOT_BACK + (PLOT_FRONT - PLOT_BACK) * index / 5
        box("forecourt joint", -PLOT_HALF_X, PLOT_HALF_X, seam - 0.015, seam + 0.015,
            PAVING_TOP - 0.004, PAVING_TOP + 0.004, paving_joint)
    for polygon in bpy.context.scene.objects["store forecourt"].data.polygons:
        polygon.use_smooth = True

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH))
    merge_by_material()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT_PATH), export_format="GLB", use_selection=True,
                              export_materials="EXPORT", export_apply=True, export_yup=True)
    print(f"SHIFT {shift.x:.3f} {shift.y:.3f}")


main()
