"""The Coffee House: the city's first building that belongs to nobody.

Every other structure here is a founder's plot. This one is scenery -- it stands on the inner
corner of Hopper Way with no plot id and no database row, so it can never be claimed.

Two departures from the reference image, both deliberate.

THE CREAM IS THE CITY'S, NOT THE REFERENCE'S. Sampled, the reference wall is (1.0, 0.831, 0.565)
linear -- at the very top of the range. Under the city rig (hemisphere 1.35 + directional 2.65, no
ambient) plus ACES that renders near-white and loses the warmth entirely. The kit's own
"Warm cream walls" is proven to read as cream on the map, so the walls use it.

THE FORECOURT IS THE CITY'S PAVING, NOT THE REFERENCE'S LAVENDER. The pale slab under the
reference is the pedestal the model is presented on, not architecture. Every pad, lamp footing and
landmark base in this city shares one paving tone; a lavender apron would look like packaging.

THE WHOLE PLOT IS PAVED. A cafe is a forecourt business; a lawn around one reads as a house with
tables in the garden. The slab is cut to the pad's exact rectangle, which is why the plot's own
dimensions appear below as constants rather than as a footprint guess.

The seating is held clear of the entrance and gathered into two raised timber decks either side of
it. A deck does more than a scatter of tables: from a camera that looks down 35 degrees it is the
thing that reads, and it says where the terrace ends without needing a fence.

Footprint stays inside the 11.4 x 10.3 plot at the placement scale of 1.4, the ceiling every
building in the kit is authored against. seat_on_plot() squares the model up on that pad, measured
off real geometry rather than guessed at in the constants.
"""

from math import cos, radians, sin
from pathlib import Path

import bpy
from mathutils import Vector


# Nested a level deeper than the flat build scripts, so the repo root is parents[2].
ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/shops/coffee-shop.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/shops/coffee-shop.glb"

WALL_X = 3.38            # the walls; the parapet oversails to ROOF_X
ROOF_X = 3.51
WALL_BACK = -3.00
WALL_FRONT = 0.80        # the shopfront plane; the terrace runs forward of this
ROOF_BACK = -3.12
ROOF_FRONT = 0.92
PIER_X = 3.10            # where the flank returns give way to the glazed frontage
BASE_TOP = 0.16
WALL_TOP = 3.55
PARAPET_LOW = 3.30
PARAPET_TOP = 4.06
# The plot, in this model's own authored units. The pad is 11.4 x 10.3 world, and every building
# on it is placed 1.24 world units back from the pad centre, so at the placement scale of 1.4 the
# pad centre sits 0.886 FORWARD of this model's origin.
PLOT_HALF_X = 5.70 / 1.4
PLOT_HALF_Y = 5.15 / 1.4
PLOT_CENTRE_Y = 1.24 / 1.4
PLOT_BACK = PLOT_CENTRE_Y - PLOT_HALF_Y
PLOT_FRONT = PLOT_CENTRE_Y + PLOT_HALF_Y
# The pad underneath is stepped, and the slab has to thread it. Its grass tops out at 0.107 world
# -- 0.076 here -- with mowing stripes above that, so the slab's TOP has to clear 0.076 or the lawn
# shows through the cement. Its soil skirt is the only part that reaches the full plot rectangle,
# and only to 0.070 world (0.050 here), so the slab's UNDERSIDE has to start above that or the two
# share a vertical face along the plot edge and z-fight there.
PAVING_BASE = 0.055
PAVING_TOP = 0.10
DECK_TOP = PAVING_TOP + 0.09
# How far the rear wall stands off the plot's back edge once seat_on_plot has pulled it in.
REAR_MARGIN = 0.05

GLASS_LOW = 0.55
GLASS_TOP = 2.26
GLASS_BACK = 0.68        # glazing recessed behind the wall face, so the piers read as depth
GLASS_FACE = 0.74
REVEAL_BACK = 0.50       # closes the openings from behind; nothing beyond it is ever visible
AWNING_TOP = 2.34
FASCIA_LOW = 2.46
FASCIA_TOP = 3.16
FASCIA_FACE = WALL_FRONT + 0.13
FASCIA_FACE_X = WALL_X + 0.13   # the same board turning the east corner; equals ROOF_X exactly

# The flank bay, shared by both sides so they stay a matched pair. It runs most of the 3.80-deep
# wall and leaves a cream margin at each end; the canopy oversails the glass slightly, the way the
# front ones do. The back margin is also what gives the bin somewhere to stand.
FLANK_GLASS = (-2.42, 0.50)
FLANK_AWNING = (-2.50, 0.58)

# The frontage, left to right: pier, window, pier, door, pier, window, pier.
WEST_BAY = (-3.00, -1.10)
DOOR_BAY = (-0.80, 0.50)
EAST_BAY = (0.80, 3.00)

LETTERING_NAME = "coffee shop lettering"
SIGN_TEXT = "StandUp Cafe"
# With the cup mark gone the name has the whole board, so it is set larger and heavier. The board
# is still far wider than it is tall, so the fit stays height-limited in practice.
TEXT_FIT_WIDTH = 5.40
TEXT_FIT_HEIGHT = 0.50


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
    """A box given as HALF-EXTENTS, matching the rest of the kit."""
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
    """The same box stated as bounds, which is how nearly every mass here is described."""
    return cube(name,
                ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
                ((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2),
                surface, bevel)


def cylinder(name, location, radius, depth, surface, vertices=20, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    bevel = obj.modifiers.new("Soft cylinder edge", "BEVEL")
    bevel.width = min(0.045, radius * 0.5, depth * 0.4)
    bevel.segments = 2
    return obj


def foliage(name, location, radius, surface, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius,
                                          location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    return obj


def raised_lettering(body, surface, fit_width, fit_height, weight=0.024, relief=0.034):
    """Raised type as real geometry. Used for the fascia name and for the door's OPEN sign.

    Lifted from build-district-sign-gantry.py, the only text-in-3D recipe in the repo. The
    load-bearing parts are all counter-intuitive: convert() acts on the selection so nothing else
    may be selected; the built-in font is too thin to hold up at city zoom so `offset` fakes a
    bold; and the fit is measured off the built glyphs rather than trusted from font metrics."""
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.object.text_add()
    obj = bpy.context.object
    obj.name = LETTERING_NAME
    data = obj.data
    data.body = body
    data.align_x = "CENTER"
    data.align_y = "CENTER"
    data.space_character = 1.04
    # The built-in font is too light to hold up at city zoom. `weight` grows the glyph outline to
    # fake a bold; it is in font units, so it holds the same relative weight whatever the type is
    # scaled to afterwards. Past about 0.03 the counters in o, e and H start to close.
    data.offset = weight
    data.extrude = relief
    # A chamfer is invisible at city zoom and multiplies the glyph triangle count.
    data.bevel_depth = 0.0
    data.resolution_u = 3
    data.materials.append(surface)

    # A FONT object is not a MESH: the smooth-shading pass filters on obj.type, and the exporter
    # will not turn curve data into geometry on its own.
    bpy.ops.object.convert(target="MESH")

    width, height, _ = obj.dimensions
    fit = min(fit_width / width, fit_height / height)
    # Z is left alone so the relief keeps its absolute depth whatever the fit works out to.
    obj.scale = (fit, fit, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Tracking adds an advance after the final glyph, which biases align_x; re-centring on the
    # real bounds is what puts the block dead centre on the board.
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    # Authored in local XY facing +Z. X+90 turns the face to -Y; Z+180 then swings it to +Y and
    # carries local +X round to world -X, which is the reading direction for a viewer out front.
    obj.rotation_euler = (radians(90), 0, radians(180))
    return obj


def striped_awning(name, a0, a1, face, green, cream, side="front"):
    """A green-and-white striped awning tilted out over an opening.

    Built as alternating slats on a support bar, the way the startup building's awning is: a single
    sloped slab with a stripe texture would need a texture, and this kit paints with geometry.

    `side` is "front", or "east"/"west" for a flank return. On a flank both the projection and the
    slat tilt take the sign of the wall it hangs off, and that is the easy thing to get wrong: a
    west awning built with the east one's numbers projects back INTO the building and tips the
    wrong way, so it reads as a shelf rather than an awning."""
    depth = 0.62
    drop = 0.30
    sign = {"front": 0, "east": 1, "west": -1}[side]
    span = a1 - a0
    slats = max(5, int(span / 0.30) | 1)   # odd, so the stripe pattern is symmetrical
    width = span / slats
    for index in range(slats):
        start = a0 + index * width
        stripe = green if index % 2 == 0 else cream
        if sign == 0:
            cube(f"{name} slat",
                 (start + width / 2, face + depth / 2, AWNING_TOP - drop / 2 + 0.03),
                 (width / 2, depth / 2, 0.055), stripe, 0.03, rotation=(radians(-26), 0, 0))
        else:
            cube(f"{name} slat",
                 (face + sign * depth / 2, start + width / 2, AWNING_TOP - drop / 2 + 0.03),
                 (depth / 2, width / 2, 0.055), stripe, 0.03, rotation=(0, radians(26 * sign), 0))
    if sign == 0:
        box(f"{name} support", a0 - 0.06, a1 + 0.06, face - 0.04, face + 0.06,
            AWNING_TOP, AWNING_TOP + 0.11, green, 0.03)
        box(f"{name} valance", a0, a1, face + depth - 0.05, face + depth + 0.02,
            AWNING_TOP - drop - 0.13, AWNING_TOP - drop + 0.02, green, 0.02)
    else:
        # Sorted because box() wants ascending bounds and a west return produces them descending.
        support = sorted((face - 0.04 * sign, face + 0.06 * sign))
        valance = sorted((face + sign * (depth - 0.05), face + sign * (depth + 0.02)))
        box(f"{name} support", support[0], support[1], a0 - 0.06, a1 + 0.06,
            AWNING_TOP, AWNING_TOP + 0.11, green, 0.03)
        box(f"{name} valance", valance[0], valance[1], a0, a1,
            AWNING_TOP - drop - 0.13, AWNING_TOP - drop + 0.02, green, 0.02)


def _at(x, y, yaw, dx, dy):
    """A local offset (dx, dy) placed at (x, y) and turned by yaw. Furniture here is built from
    axis-aligned boxes that each carry the same yaw, so this is what puts their centres in the
    right place -- the alternative, parenting to an empty, does not survive the exporter cleanly."""
    return (x + dx * cos(yaw) - dy * sin(yaw), y + dx * sin(yaw) + dy * cos(yaw))


def chair_at(x, y, yaw):
    """Where the chair on a table's `yaw` side stands.

    A chair at yaw faces (-sin yaw, cos yaw), so to face the table it has to sit the opposite way
    along that line -- which is where the sign flip below comes from. This is stated once because
    the patrons are placed by it too, and a chair and the person in it drifting apart is the one
    error the merge would bake in silently."""
    return x + 0.74 * sin(yaw), y - 0.74 * cos(yaw)


def cafe_chair(x, y, floor, yaw, surface, frame_surface):
    """A ladder-back chair. yaw 0 puts its back on the -y side, so it faces +y.

    Kit-canonical heights: seat at floor + 0.26, back to floor + 0.68. Legs, posts and rails carry
    no bevel -- at 0.05 thick the modifier would eat most of the section, and it is three hundred
    triangles a chair that nothing at city zoom would ever resolve."""
    seat_z = floor + 0.26
    cube("cafe chair seat", (*_at(x, y, yaw, 0, 0), seat_z + 0.03), (0.19, 0.19, 0.03),
         surface, 0.02, (0, 0, yaw))
    for dx in (-0.155, 0.155):
        cube("cafe chair post", (*_at(x, y, yaw, dx, -0.165), floor + 0.47),
             (0.028, 0.028, 0.21), frame_surface, 0.0, (0, 0, yaw))
    # Three rails rather than a solid panel: a filled back reads as a crate at this size, and the
    # reference's chairs are ladder-backs.
    for lift in (0.10, 0.22, 0.34):
        cube("cafe chair rail", (*_at(x, y, yaw, 0, -0.165), seat_z + 0.03 + lift),
             (0.155, 0.018, 0.032), frame_surface, 0.0, (0, 0, yaw))
    for dx in (-0.15, 0.15):
        for dy in (-0.15, 0.15):
            cube("cafe chair leg", (*_at(x, y, yaw, dx, dy), floor + 0.13),
                 (0.026, 0.026, 0.13), frame_surface, 0.0, (0, 0, yaw))


def cafe_table(x, y, floor, seat_yaws, top_surface, frame_surface, half=0.44):
    """A table with a chair on each of the given sides."""
    box("cafe table top", x - half, x + half, y - half, y + half,
        floor + 0.32, floor + 0.38, top_surface, 0.025)
    box("cafe table apron", x - half + 0.06, x + half - 0.06, y - half + 0.06, y + half - 0.06,
        floor + 0.26, floor + 0.32, frame_surface, 0.02)
    for leg_x in (x - half + 0.08, x + half - 0.08):
        for leg_y in (y - half + 0.08, y + half - 0.08):
            box("cafe table leg", leg_x - 0.035, leg_x + 0.035, leg_y - 0.035, leg_y + 0.035,
                floor, floor + 0.32, frame_surface)
    for yaw in seat_yaws:
        cafe_chair(*chair_at(x, y, yaw), floor, yaw, top_surface, frame_surface)


# The patron figure, in the chair's own local frame: +y is the direction the sitter faces, and
# every height below is measured from the seat top rather than from the deck.
#
# SCALED TO THE CHAIR, NOT TO THE DOOR. These two give different answers -- the terrace furniture
# is authored a little toy against a 2.26 shopfront -- and the chair is the one that matters,
# because a patron is only ever seen sitting in one. Taking the chair back as a true 0.90m puts
# this model at about 0.756 units per metre, which makes a seated adult 0.98 tall: the number
# below. Sized off the door instead they would burst out of the seats.
SEAT_TOP = 0.32          # cafe_chair's seat spans floor + 0.26 to floor + 0.32
HEAD_RISE = 0.575        # seat top to head centre
HEAD_RADIUS = 0.082


def _lean(dy, dz, lean):
    """A local (forward, up) offset pivoted about the hips by `lean` radians, forward positive.

    cube() turns a box about its own centre, not about a pivot, so anything that leans has to be
    handed the centre it ends up at. This is that calculation, and it has to agree with the X
    rotation the caller passes -- which is -lean, because a Blender X rotation tips +z toward -y."""
    return dy * cos(lean) + dz * sin(lean), dz * cos(lean) - dy * sin(lean)


def seated_patron(x, y, floor, yaw, lean, arms, skin, hair_surface, top_surface, leg_surface):
    """One person sitting in the chair at (x, y, yaw), built from the kit's boxes.

    `lean` tips the upper body about the hips: forward for someone working, back for someone in
    conversation. It is the whole difference between the two poses, and at this zoom it is enough
    -- the pose reads as a silhouette against the deck, so the angle of the back and the position
    of the head carry it, and finer articulation would be triangles nothing resolves.

    `arms` is "table" or "lap". Legs, arms and hair carry no bevel, for the reason cafe_chair
    gives: at these sections the modifier eats most of the stock."""
    hip = floor + SEAT_TOP
    spin = (0, 0, yaw)
    tilt = (-lean, 0, yaw)

    def upright(name, dx, dy, dz, half, surface, bevel=0.0):
        """A part fixed to the hips and legs, which do not lean."""
        cube(name, (*_at(x, y, yaw, dx, dy), hip + dz), half, surface, bevel, spin)

    def leaning(name, dx, dy, dz, half, surface, bevel=0.0):
        """A part carried by the upper body, so it moves and turns with the lean."""
        ly, lz = _lean(dy, dz, lean)
        cube(name, (*_at(x, y, yaw, dx, ly), hip + lz), half, surface, bevel, tilt)

    upright("terrace patron hips", 0.0, 0.0, 0.06, (0.135, 0.115, 0.06), leg_surface, 0.03)
    for dx in (-0.068, 0.068):
        upright("terrace patron thigh", dx, 0.17, 0.055, (0.058, 0.17, 0.055), leg_surface, 0.02)
        upright("terrace patron shin", dx, 0.30, -0.16, (0.05, 0.05, 0.16), leg_surface)
        upright("terrace patron shoe", dx, 0.36, -0.2925, (0.055, 0.10, 0.0275), hair_surface, 0.02)

    # 0.038 rather than 0.04: cube() spends a third bevel segment at 0.04 and up, and on the one
    # patron box wide enough not to have its bevel capped that is 600 triangles across the terrace
    # for a rounding nothing can see. Every other part here already caps below the threshold.
    leaning("terrace patron torso", 0.0, 0.0, 0.28, (0.145, 0.105, 0.16), top_surface, 0.038)
    leaning("terrace patron shoulders", 0.0, 0.0, 0.44, (0.165, 0.10, 0.045), top_surface, 0.04)
    leaning("terrace patron neck", 0.0, 0.0, 0.50, (0.045, 0.045, 0.03), skin)

    # Upper arms hang off the shoulders and lean with them. The forearms do not: they rest on the
    # table or the lap, both of which stay put however far the sitter tips.
    for dx in (-0.175, 0.175):
        leaning("terrace patron arm", dx, 0.0, 0.30, (0.045, 0.05, 0.13), top_surface, 0.03)
    # The table pose rides above the thigh line. That is the wrong height for the table -- this
    # one's surface is only 0.06 above its seat, well under the thighs -- but forearms dropped to
    # the true surface disappear INSIDE the legs from a camera looking down, and hands on a
    # keyboard are what the pose is for.
    #
    # The lap pose has to go the other way and sit slightly INTO the thighs. Clear of them it
    # reads as two pale planks floating over the sitter rather than as arms, because nothing
    # joins them to the leg they are supposed to be resting on. They are also drawn shorter and
    # closer to the body, so the hands gather in the lap instead of reaching for a table that
    # this sitter is not using.
    reach, lift, span, spread = (0.28, 0.15, 0.15, 0.155) if arms == "table" \
        else (0.13, 0.13, 0.10, 0.125)
    for dx in (-spread, spread):
        upright("terrace patron forearm", dx, reach, lift, (0.042, span, 0.04), skin, 0.025)

    hy, hz = _lean(0.0, HEAD_RISE, lean)
    # foliage() is the kit's only icosphere; nothing about it is leaf-specific.
    foliage("terrace patron head", (*_at(x, y, yaw, 0.0, hy), hip + hz), HEAD_RADIUS, skin)
    # A cap over the crown and down the back, which is what turns a bare sphere into a head at
    # city zoom. Bevelled almost to its own half-extent so it sits on the skull as a dome, and cut
    # WIDER than HEAD_RADIUS on purpose: sized to the sphere it would be flush with it, and the
    # skull would push through the sides of its own hair.
    cy, cz = _lean(-0.012, HEAD_RISE + 0.052, lean)
    cube("terrace patron hair", (*_at(x, y, yaw, 0.0, cy), hip + cz),
         (0.090, 0.090, 0.045), hair_surface, 0.040, tilt)


def terrace_laptop(x, y, floor, yaw, shell_surface, screen_surface):
    """An open laptop on the table in front of the patron at (x, y, yaw).

    This is the prop that actually says "working" from above. A hunched pose alone does not read
    at city zoom, but a pale angled screen catches the key light and is legible at any distance the
    shop itself is, which is why it carries a little emission of its own.

    The screen is a flat plate stood up by an X rotation. At exactly 90 degrees it would be
    vertical; short of that its top edge falls away from the sitter, which is the way a laptop
    actually opens. Blender's default XYZ euler order applies that tilt before the yaw, so the
    two compose in the plate's own frame rather than fighting."""
    top = floor + 0.38                     # the table surface, from cafe_table
    cube("terrace laptop base", (*_at(x, y, yaw, 0.0, 0.44), top + 0.01),
         (0.11, 0.08, 0.01), shell_surface, 0.008, (0, 0, yaw))
    hinge = radians(75)
    # Hinged at the base's far edge, so the plate is offset half its height along the tilted axis.
    cube("terrace laptop screen",
         (*_at(x, y, yaw, 0.0, 0.52 + 0.075 * cos(hinge)), top + 0.02 + 0.075 * sin(hinge)),
         (0.11, 0.075, 0.008), screen_surface, 0.006, (hinge, 0, yaw))


def potted_tree(x, y, floor, pot_surface, soil_surface, trunk_surface, leaves):
    """A clipped bay in a white pot -- the reference's planters carry a small standard tree, not a
    loose shrub, which is also what keeps them from reading as the verge's foliage."""
    cylinder("shop planter pot", (x, y, floor + 0.18), 0.21, 0.36, pot_surface, 16)
    cylinder("shop planter soil", (x, y, floor + 0.35), 0.185, 0.03, soil_surface, 16)
    cylinder("shop planter trunk", (x, y, floor + 0.54), 0.045, 0.40, trunk_surface, 8)
    for dx, dy, dz, radius, leaf in ((0.0, 0.0, 0.86, 0.26, leaves[1]),
                                     (-0.15, 0.06, 0.76, 0.18, leaves[0]),
                                     (0.14, -0.05, 0.79, 0.19, leaves[2])):
        foliage("shop planter foliage", (x + dx, y + dy, floor + dz), radius, leaf)


def hedge_box(name, x0, x1, y0, y1, floor, pot_surface, soil_surface, leaves):
    """A low planter run along a deck edge. It is what tells the eye where the terrace stops, so
    the shop needs no railing and no bollards to bound it."""
    box(f"{name} trough", x0, x1, y0, y1, floor, floor + 0.42, pot_surface, 0.04)
    box(f"{name} soil", x0 + 0.06, x1 - 0.06, y0 + 0.06, y1 - 0.06,
        floor + 0.38, floor + 0.44, soil_surface)
    span = x1 - x0 if (x1 - x0) >= (y1 - y0) else y1 - y0
    balls = max(4, int(span / 0.27))
    for index in range(balls):
        share = (index + 0.5) / balls
        cx = x0 + (x1 - x0) * share if (x1 - x0) >= (y1 - y0) else (x0 + x1) / 2
        cy = (y0 + y1) / 2 if (x1 - x0) >= (y1 - y0) else y0 + (y1 - y0) * share
        foliage(f"{name} hedge", (cx, cy, floor + 0.48), 0.165, leaves[index % len(leaves)])


def timber_deck(name, x0, x1, y0, y1, deck_surface, joint_surface):
    """A raised deck with its planks scribed in. The planks run front-to-back, toward the shop,
    which is the direction that reads as decking rather than as a striped rug."""
    box(f"{name} platform", x0, x1, y0, y1, PAVING_TOP, DECK_TOP, deck_surface, 0.03)
    box(f"{name} nosing", x0, x1, y0, y0 + 0.07, PAVING_TOP, DECK_TOP + 0.005, joint_surface, 0.02)
    planks = max(4, int((x1 - x0) / 0.30))
    for index in range(1, planks):
        seam = x0 + (x1 - x0) * index / planks
        box(f"{name} plank seam", seam - 0.011, seam + 0.011, y0 + 0.07, y1,
            DECK_TOP - 0.005, DECK_TOP + 0.004, joint_surface)


def merge_by_material():
    """Collapse the scene to one mesh per material, for export only.

    The shop is authored as three hundred separate boxes. That is the right way to build it and the
    wrong way to ship it: every box costs a node, a mesh and its own accessors in the glb, and this
    asset is preloaded for every visitor rather than deferred like the level-2 shells. Merging
    changes no geometry and no material -- only how many objects carry it.

    Modifiers have to be applied first. join() keeps only the active object's modifier stack, so
    every other bevel in the group would be silently dropped. And it runs after the smooth-shading
    pass, because those flags are per polygon and survive the join -- which is what lets the
    lettering stay flat inside a mesh it now shares with the terrace crockery."""
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


def seat_on_plot():
    """Square the shop on its plot, and return the shift so the forecourt can be laid to match.

    Two independent corrections, both measured off real geometry rather than guessed at in the
    constants. Across X the side awning and the bin project east only, so the geometric centre is
    not the origin -- and a city entity is placed BY its origin, so an uncorrected model sits
    visibly off-centre on its pad. Along Y every building shares a placement that sets it 1.24
    world units back from the pad centre; for this footprint that would hang the rear wall out over
    the ground behind, which is the one thing a fully paved plot cannot hide.

    Bevels only ever cut inward, so object bounds stand in safely for the exported geometry."""
    xs, ys = [], []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            xs.append(world.x)
            ys.append(world.y)
    shift = Vector(((min(xs) + max(xs)) / -2, PLOT_BACK + REAR_MARGIN - min(ys), 0.0))
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.location += shift
    return shift


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    # --- Palette. Sampled per hue family off the reference and converted sRGB -> linear; reading
    # the hex values straight in would land about a stop light. ---
    cream = material("Coffee House cream wall", (0.82, 0.68, 0.45))
    cream_light = material("Coffee House roof deck", (0.72, 0.63, 0.47))
    tan = material("Coffee House parapet tan", (0.591, 0.397, 0.175), roughness=0.68)
    green = material("Coffee House green", (0.065, 0.266, 0.016), roughness=0.60)
    green_deep = material("Coffee House green shade", (0.026, 0.127, 0.002), roughness=0.62)
    awning_cream = material("Awning stripe cream", (0.88, 0.86, 0.78), roughness=0.62)
    letter_cream = material("Coffee House lettering", (0.92, 0.90, 0.83), roughness=0.48)
    timber = material("Coffee House timber", (0.235, 0.130, 0.048), roughness=0.66)
    timber_dark = material("Coffee House timber shade", (0.105, 0.058, 0.024), roughness=0.66)
    # The storefront reads almost black in the reference. A little emission stands in for the room
    # behind it -- kept low, because the city Canvas takes three's default ACES tone map and
    # anything brighter rolls off to flat white.
    glass = material("Coffee House glazing", (0.030, 0.038, 0.035), roughness=0.44, metallic=0.0,
                     emission=(0.055, 0.048, 0.032), emission_strength=0.7)
    # One paving tone city-wide: the value every pad, lamp footing and landmark base already uses.
    paving = material("Cool grey paving", (0.48, 0.51, 0.53), roughness=0.85)
    steel = material("Coffee House roof unit", (0.38, 0.36, 0.33), roughness=0.42, metallic=0.35)
    steel_dark = material("Coffee House vent", (0.20, 0.20, 0.19), roughness=0.50, metallic=0.30)
    bin_blue = material("Coffee House bin", (0.098, 0.136, 0.231), roughness=0.60)
    pot = material("Coffee House planter", (0.85, 0.84, 0.79), roughness=0.70)
    # Shrub greens, not canopy greens: at planter scale the teal-leaning family is the right one,
    # and mixing the two makes tree-scale foliage go mint against the verge.
    leaves = (material("Shrub deep green", (0.05, 0.29, 0.12)),
              material("Shrub green", (0.08, 0.48, 0.18)),
              material("Shrub highlight", (0.23, 0.68, 0.26)))
    # Terrace patrons. The tops are held muted on purpose: four saturated shirts on a deck this
    # size would out-shout the green fascia, and the building has to stay the thing you see first.
    patron_tops = (material("Coffee House patron slate", (0.085, 0.135, 0.245), roughness=0.78),
                   material("Coffee House patron rust", (0.355, 0.115, 0.045), roughness=0.78),
                   material("Coffee House patron sage", (0.155, 0.235, 0.135), roughness=0.78),
                   material("Coffee House patron mustard", (0.480, 0.320, 0.055), roughness=0.78))
    patron_skins = (material("Coffee House patron skin deep", (0.290, 0.150, 0.082), roughness=0.80),
                    material("Coffee House patron skin mid", (0.480, 0.270, 0.145), roughness=0.80),
                    material("Coffee House patron skin light", (0.680, 0.450, 0.295), roughness=0.80))
    patron_hair = (material("Coffee House patron hair dark", (0.028, 0.020, 0.016), roughness=0.66),
                   material("Coffee House patron hair brown", (0.105, 0.055, 0.026), roughness=0.66))
    patron_legs = material("Coffee House patron denim", (0.075, 0.092, 0.125), roughness=0.82)
    laptop_shell = material("Coffee House laptop", (0.42, 0.44, 0.46), roughness=0.40, metallic=0.35)
    # Lit, but barely. The screen is a 0.22-wide plate seen from above through ACES; at the
    # strength the OPEN sign carries it would blow to a white chip and lose its angle.
    laptop_screen = material("Coffee House laptop screen", (0.105, 0.130, 0.155), roughness=0.30,
                             emission=(0.180, 0.215, 0.250), emission_strength=0.55)
    paving_joint = material("Cool grey paving joint", (0.36, 0.39, 0.41), roughness=0.88)
    paving_path = material("Cool grey entrance paving", (0.56, 0.58, 0.59), roughness=0.82)
    deck_timber = material("Coffee House deck", (0.455, 0.310, 0.152), roughness=0.72)
    deck_joint = material("Coffee House deck seam", (0.245, 0.158, 0.070), roughness=0.74)
    soil = material("Coffee House planter soil", (0.055, 0.038, 0.026), roughness=0.92)
    open_glow = material("Coffee House open sign", (0.10, 0.42, 0.16), roughness=0.30,
                         emission=(0.16, 0.62, 0.22), emission_strength=1.4)
    # Brown type, cut out of the lit panel behind it -- which is how an illuminated OPEN sign
    # actually works: the letters are the part that does NOT glow. It still carries a little warm
    # emission of its own, because the doorway is recessed and in shade all day, and an unlit brown
    # in there crushes to near black and loses the hue entirely.
    open_letter = material("Coffee House open lettering", (0.150, 0.072, 0.028), roughness=0.55,
                           emission=(0.100, 0.046, 0.018), emission_strength=0.8)

    # --- Ground. The plinth only; the forecourt is laid after seat_on_plot, because it has to
    # line up with the pad rather than with the building. ---
    box("shop plinth", -WALL_X - 0.06, WALL_X + 0.06, WALL_BACK - 0.06, WALL_FRONT + 0.06,
        0.0, BASE_TOP, paving, 0.04)

    # --- The shell. The frontage is built as real piers around real openings rather than as a
    # solid wall with trim laid on it: a frame floating in an open bay is what made the door on the
    # teal brow flicker, and coplanar trim on a solid wall is the other way to earn the same bug. ---
    box("shop rear mass", -PIER_X, PIER_X, WALL_BACK, -0.55, BASE_TOP, WALL_TOP, cream, 0.05)
    box("shop west flank", -WALL_X, -PIER_X, WALL_BACK, WALL_FRONT, BASE_TOP, WALL_TOP, cream, 0.05)
    box("shop east flank", PIER_X, WALL_X, WALL_BACK, WALL_FRONT, BASE_TOP, WALL_TOP, cream, 0.05)
    box("shop front head", -PIER_X, PIER_X, -0.55, WALL_FRONT, GLASS_TOP, WALL_TOP, cream, 0.04)
    # Both stop either side of the door. Run across the bay, the stallriser passes in FRONT of the
    # leaf -- the mass behind it fills the opening too -- and the door reads as floating on a plank
    # instead of standing on its threshold.
    for name, x0, x1 in (("west", -PIER_X, DOOR_BAY[0]), ("east", DOOR_BAY[1], PIER_X)):
        box(f"shop front sill mass {name}", x0, x1, -0.55, GLASS_BACK, BASE_TOP, GLASS_LOW,
            cream, 0.03)
        box(f"shop front stallriser {name}", x0, x1, GLASS_BACK, WALL_FRONT, BASE_TOP, GLASS_LOW,
            timber, 0.03)
    # Closes every opening from behind. Nothing beyond this plane is ever visible, which is why the
    # shell needs no interior.
    box("shop reveal back", -PIER_X, PIER_X, REVEAL_BACK - 0.07, REVEAL_BACK,
        BASE_TOP, GLASS_TOP, timber_dark)
    for index, (left, right) in enumerate(zip((-PIER_X, WEST_BAY[1], DOOR_BAY[1], EAST_BAY[1]),
                                              (WEST_BAY[0], DOOR_BAY[0], EAST_BAY[0], PIER_X))):
        box(f"shop front pier {index}", left, right, -0.55, WALL_FRONT,
            GLASS_LOW, GLASS_TOP, cream, 0.03)

    # --- The two glazed bays. ---
    for name, (x0, x1) in (("west bay", WEST_BAY), ("east bay", EAST_BAY)):
        box(f"shop {name} glass", x0, x1, GLASS_BACK, GLASS_FACE, GLASS_LOW, GLASS_TOP, glass)
        box(f"shop {name} head", x0 - 0.02, x1 + 0.02, GLASS_BACK - 0.02, WALL_FRONT - 0.02,
            GLASS_TOP - 0.13, GLASS_TOP, timber, 0.03)
        for jamb_x in (x0 + 0.05, x1 - 0.05):
            box(f"shop {name} jamb", jamb_x - 0.055, jamb_x + 0.055, GLASS_BACK - 0.02,
                WALL_FRONT - 0.02, GLASS_LOW, GLASS_TOP, timber, 0.025)
        box(f"shop {name} mullion", (x0 + x1) / 2 - 0.04, (x0 + x1) / 2 + 0.04,
            GLASS_BACK - 0.01, WALL_FRONT - 0.05, GLASS_LOW, GLASS_TOP, timber, 0.02)

    # --- The door. Depth ladder, front being +Y: jambs 0.80, leaf 0.73, glass 0.745, sign 0.775.
    # Every layer clears the one behind it -- coplanar faces here are what flickered last time. ---
    door_left, door_right = DOOR_BAY
    for jamb_x in (door_left + 0.05, door_right - 0.05):
        box("shop door jamb", jamb_x - 0.05, jamb_x + 0.05, 0.62, WALL_FRONT,
            BASE_TOP, GLASS_TOP, timber, 0.025)
    box("shop door head", door_left, door_right, 0.62, WALL_FRONT, 2.14, GLASS_TOP, timber, 0.03)
    box("shop door leaf", door_left + 0.10, door_right - 0.10, 0.66, 0.73, BASE_TOP, 2.14,
        timber_dark, 0.025)
    box("shop door glass", door_left + 0.18, door_right - 0.18, 0.70, 0.745, 1.00, 2.06, glass)
    # Depth ladder again, front being +Y: glass 0.745, surround 0.770, field 0.782, type 0.784.
    sign_mid = (door_left + door_right) / 2
    box("shop door sign surround", sign_mid - 0.29, sign_mid + 0.29, 0.750, 0.770,
        1.60, 1.96, letter_cream, 0.02)
    box("shop door sign field", sign_mid - 0.265, sign_mid + 0.265, 0.770, 0.782,
        1.625, 1.935, open_glow, 0.015)
    # Set in real geometry rather than painted on, so it survives being zoomed into. The relief is
    # a third of the fascia's: at this size the fascia's depth would read as a slab, not a letter.
    open_sign = raised_lettering("OPEN", open_letter, 0.40, 0.17, weight=0.026, relief=0.012)
    open_sign.location = (sign_mid, 0.796, 1.78)
    cylinder("shop door pull", (door_right - 0.20, 0.78, 1.24), 0.022, 0.30, steel, 12)

    # --- The fascia: a green board across the frontage carrying the name. ---
    box("shop fascia board", -ROOF_X, ROOF_X, WALL_FRONT, FASCIA_FACE, FASCIA_LOW, FASCIA_TOP,
        green, 0.04)
    box("shop fascia lip", -ROOF_X - 0.04, ROOF_X + 0.04, WALL_FRONT - 0.02, FASCIA_FACE + 0.03,
        FASCIA_LOW - 0.07, FASCIA_LOW + 0.02, green_deep, 0.03)
    # The band turns both corners. West runs the wall end to end; east stops short of the high
    # back window, which is the one thing on either flank sitting at the band's own height.
    for name, sign, band_back in (("west", -1, WALL_BACK), ("east", 1, -1.98)):
        band = sorted((sign * WALL_X, sign * FASCIA_FACE_X))
        lip = sorted((sign * (WALL_X - 0.02), sign * (FASCIA_FACE_X + 0.03)))
        box(f"shop fascia {name} return", band[0], band[1], band_back, WALL_FRONT,
            FASCIA_LOW, FASCIA_TOP, green, 0.04)
        box(f"shop fascia {name} return lip", lip[0], lip[1], band_back, WALL_FRONT,
            FASCIA_LOW - 0.07, FASCIA_LOW + 0.02, green_deep, 0.03)
    lettering = raised_lettering(SIGN_TEXT, letter_cream, TEXT_FIT_WIDTH, TEXT_FIT_HEIGHT)
    lettering.location = (0.0, FASCIA_FACE + 0.02, (FASCIA_LOW + FASCIA_TOP) / 2)

    # --- Awnings: two on the front, one returning along the east flank. ---
    striped_awning("west awning", WEST_BAY[0] - 0.10, WEST_BAY[1] + 0.10, WALL_FRONT,
                   green, awning_cream)
    striped_awning("east awning", EAST_BAY[0] - 0.10, EAST_BAY[1] + 0.10, WALL_FRONT,
                   green, awning_cream)


    # --- Flanks: a matched glazed bay and canopy on each. Laid proud of the wall rather than
    # recessed -- a flank carries no piers to recess into. ---
    for side, sign in (("west", -1), ("east", 1)):
        outer, face = sign * WALL_X, sign * (WALL_X + 0.05)
        trim = sorted((sign * (WALL_X - 0.02), sign * (WALL_X + 0.07)))
        box(f"shop {side} flank glass", *sorted((outer, face)), *FLANK_GLASS,
            GLASS_LOW, GLASS_TOP, glass)
        box(f"shop {side} flank head", trim[0], trim[1],
            FLANK_GLASS[0] - 0.09, FLANK_GLASS[1] + 0.09,
            GLASS_TOP - 0.02, GLASS_TOP + 0.12, timber, 0.03)
        for share in (1 / 3, 2 / 3):
            seam = FLANK_GLASS[0] + (FLANK_GLASS[1] - FLANK_GLASS[0]) * share
            box(f"shop {side} flank mullion", *sorted((sign * (WALL_X - 0.01), sign * (WALL_X + 0.06))),
                seam - 0.04, seam + 0.04, GLASS_LOW, GLASS_TOP, timber, 0.02)
        for jamb_y in (FLANK_GLASS[0] - 0.05, FLANK_GLASS[1] + 0.05):
            box(f"shop {side} flank jamb", trim[0], trim[1], jamb_y - 0.055, jamb_y + 0.055,
                GLASS_LOW, GLASS_TOP, timber, 0.025)
        striped_awning(f"{side} flank awning", *FLANK_AWNING, outer, green, awning_cream, side=side)

    # The high back window, lifted clear of the east canopy's support bar. It is what stops the
    # east sign band running the full wall, and why the two bands are different lengths.
    box("shop rear window", WALL_X, WALL_X + 0.04, -2.74, -2.14, 2.58, 3.10, glass)
    box("shop rear window frame", WALL_X - 0.02, WALL_X + 0.06, -2.82, -2.06, 2.52, 3.16,
        timber_dark, 0.03)

    box("shop rear door frame", -1.00, 0.30, WALL_BACK - 0.09, WALL_BACK,
        BASE_TOP, 2.16, timber, 0.03)
    box("shop rear door leaf", -0.92, 0.22, WALL_BACK - 0.14, WALL_BACK - 0.07,
        BASE_TOP, 2.08, timber_dark, 0.025)
    cylinder("shop rear door pull", (0.14, WALL_BACK - 0.17, 1.24), 0.022, 0.26, steel, 12)
    for window_x in (-2.55, 1.85):
        box("shop rear high window", window_x, window_x + 0.70, WALL_BACK - 0.04, WALL_BACK,
            2.42, 3.02, glass)
        box("shop rear high frame", window_x - 0.08, window_x + 0.78, WALL_BACK - 0.06, WALL_BACK,
            2.34, 3.10, timber_dark, 0.03)
    # Downpipes off the back corners, run to a shoe just clear of the plinth.
    for pipe_x in (-PIER_X + 0.16, PIER_X - 0.16):
        cylinder("shop downpipe", (pipe_x, WALL_BACK - 0.11, (BASE_TOP + PARAPET_LOW) / 2),
                 0.065, PARAPET_LOW - BASE_TOP, steel_dark, 10)

    # --- Roof: cream deck inside a tan parapet, the reference's one warm structural note. ---
    box("shop roof deck", -WALL_X, WALL_X, WALL_BACK, WALL_FRONT, WALL_TOP - 0.10, WALL_TOP,
        cream_light, 0.03)
    for name, x0, x1, y0, y1 in (
        ("parapet front", -ROOF_X, ROOF_X, WALL_FRONT - 0.02, ROOF_FRONT),
        ("parapet back", -ROOF_X, ROOF_X, ROOF_BACK, WALL_BACK + 0.02),
        ("parapet west", -ROOF_X, -WALL_X + 0.02, ROOF_BACK, ROOF_FRONT),
        ("parapet east", WALL_X - 0.02, ROOF_X, ROOF_BACK, ROOF_FRONT),
    ):
        box(f"shop {name}", x0, x1, y0, y1, PARAPET_LOW, PARAPET_TOP, tan, 0.05)

    # --- Roof furniture. Sized to just break the parapet line: from the city camera's 35 degrees
    # anything shorter is hidden outright, and anything taller reads as clutter. ---
    for unit_x, unit_y in ((-1.30, -0.90), (0.60, 0.05)):
        box("shop roof unit", unit_x - 0.44, unit_x + 0.44, unit_y - 0.43, unit_y + 0.43,
            WALL_TOP, WALL_TOP + 0.55, steel, 0.05)
        cylinder("shop roof unit fan", (unit_x, unit_y, WALL_TOP + 0.57), 0.26, 0.05, steel_dark, 16)
        for blade in range(3):
            cube("shop roof fan blade", (unit_x, unit_y, WALL_TOP + 0.60),
                 (0.22, 0.035, 0.012), steel, 0.0, rotation=(0, 0, radians(blade * 60)))
    for vent_x in (1.90, 2.50):
        cylinder("shop roof vent", (vent_x, -1.20, WALL_TOP + 0.34), 0.075, 0.68, steel_dark, 12)
    # A duct run tying the two units together and a kerbed access hatch. The skylight that stood
    # here read as an unexplained dark slab from above, which is the failure mode of roof dressing:
    # every object up there has to be legible as a thing that does something.
    box("shop roof duct", -1.30, 0.60, -0.16, 0.10, WALL_TOP + 0.16, WALL_TOP + 0.36, steel, 0.04)
    box("shop roof hatch kerb", 1.52, 2.48, -2.76, -2.04, WALL_TOP, WALL_TOP + 0.12,
        steel_dark, 0.03)
    box("shop roof hatch lid", 1.56, 2.44, -2.72, -2.08, WALL_TOP + 0.10, WALL_TOP + 0.20,
        steel, 0.04)

    # --- Door furniture: a threshold and a pair of wall lamps, added now so they travel with the
    # building through seat_on_plot. ---
    for lamp_x in (door_left - 0.30, door_right + 0.30):
        cylinder("shop door lamp arm", (lamp_x, WALL_FRONT + 0.05, 2.02), 0.03, 0.16, steel_dark,
                 8, rotation=(radians(90), 0, 0))
        cube("shop door lamp shade", (lamp_x, WALL_FRONT + 0.13, 1.94), (0.09, 0.09, 0.07),
             steel_dark, 0.02)
        box("shop door lamp glow", lamp_x - 0.065, lamp_x + 0.065, WALL_FRONT + 0.06,
            WALL_FRONT + 0.20, 1.85, 1.88, open_glow)

    box("shop bin body", WALL_X + 0.04, WALL_X + 0.40, -3.04, -2.62, PAVING_TOP, 0.68,
        bin_blue, 0.05)
    box("shop bin lid", WALL_X, WALL_X + 0.44, -3.10, -2.56, 0.68, 0.76, bin_blue, 0.04)

    # Everything above is the building. Square it on the pad before the forecourt goes down: the
    # paving is cut to the plot, so it has to be laid in the plot's coordinates, not the shop's.
    shift = seat_on_plot()
    front = WALL_FRONT + shift.y                 # the shopfront plane, in final coordinates
    entry_left = DOOR_BAY[0] + shift.x - 0.28    # the approach corridor, kept clear of tables
    entry_right = DOOR_BAY[1] + shift.x + 0.28

    # --- The forecourt: the whole plot, paved. ---
    box("shop forecourt", -PLOT_HALF_X, PLOT_HALF_X, PLOT_BACK, PLOT_FRONT, PAVING_BASE,
        PAVING_TOP, paving, 0.03)
    # Scribed joints. A slab this size with no relief reads as a grey void from above, and joints
    # are what a poured forecourt actually has. They sit proud rather than sunk: a groove at this
    # scale fills with shadow and disappears.
    for index in range(1, 6):
        seam = -PLOT_HALF_X + 2 * PLOT_HALF_X * index / 6
        box("forecourt joint", seam - 0.015, seam + 0.015, PLOT_BACK, PLOT_FRONT,
            PAVING_TOP - 0.004, PAVING_TOP + 0.004, paving_joint)
    for index in range(1, 5):
        seam = PLOT_BACK + (PLOT_FRONT - PLOT_BACK) * index / 5
        box("forecourt joint", -PLOT_HALF_X, PLOT_HALF_X, seam - 0.015, seam + 0.015,
            PAVING_TOP - 0.004, PAVING_TOP + 0.004, paving_joint)
    # The approach to the door, in a lighter tone. It is why the seating stays off the middle:
    # tables in front of an entrance make the entrance the thing customers walk around.
    box("shop entrance path", entry_left, entry_right, front - 0.10, PLOT_FRONT,
        PAVING_TOP - 0.002, PAVING_TOP + 0.012, paving_path, 0.02)
    box("shop threshold", entry_left + 0.20, entry_right - 0.20, front, front + 0.34,
        PAVING_TOP + 0.010, PAVING_TOP + 0.075, paving_path, 0.02)

    # --- Two raised decks, one either side of the approach. The east deck is the larger: it turns
    # the corner under the wrapped fascia and its own awning, which is where a corner shop puts its
    # terrace. ---
    east_deck = (entry_right + 0.16, PLOT_HALF_X - 0.05)
    west_deck = (-PLOT_HALF_X + 0.05, entry_left - 0.16)
    deck_back, deck_front = front + 0.72, PLOT_FRONT - 0.44
    timber_deck("east deck", *east_deck, deck_back, deck_front, deck_timber, deck_joint)
    timber_deck("west deck", *west_deck, deck_back, deck_front, deck_timber, deck_joint)

    seating_y = (deck_back + deck_front) / 2
    # East: a four-top and a two-top. West: a pair of two-tops. Chairs are given as the sides they
    # sit on, so no table ever puts a back against the shop window.
    east_four, east_two = east_deck[0] + 1.00, east_deck[1] - 0.72
    west_near, west_far = west_deck[0] + 0.72, west_deck[1] - 0.72
    cafe_table(east_four, seating_y, DECK_TOP,
               (0.0, radians(180), radians(90), radians(-90)), timber, timber_dark)
    cafe_table(east_two, seating_y, DECK_TOP, (0.0, radians(180)), timber, timber_dark)
    cafe_table(west_near, seating_y, DECK_TOP, (0.0, radians(180)), timber, timber_dark)
    cafe_table(west_far, seating_y, DECK_TOP, (0.0, radians(180)), timber, timber_dark)
    # Cups left on two of the tops, the way the reference dresses its tables.
    for cup_x, cup_y in ((east_four + 0.14, seating_y + 0.12), (west_far - 0.60, seating_y - 0.10)):
        cylinder("terrace saucer", (cup_x, cup_y, DECK_TOP + 0.395), 0.075, 0.02, letter_cream, 12)
        cylinder("terrace cup", (cup_x, cup_y, DECK_TOP + 0.45), 0.052, 0.10, letter_cream, 12)

    # --- Who is sitting out. Six of the ten chairs, never more: a terrace with every seat taken
    # reads as a queue, and the empty chairs are what makes the full ones look chosen. The west
    # far table is left clear on purpose -- it keeps its abandoned cup, which is the whole story
    # of a table someone has just left.
    #
    # The two conversations are placed where the chairs genuinely face each other: across the
    # four-top's short axis, and across the west near two-top. Talkers lean back and rest their
    # hands in their laps; the ones working lean in over a laptop. Nothing here is tied to the
    # cafe's presence channel -- this is dressing, and it is on whether the city is busy or not.
    LEAN_IN, LEAN_BACK = radians(14), radians(-9)
    patrons = (
        # table,     yaw,           lean,      arms,    top, skin, hair
        (east_four,  radians(90),   LEAN_BACK, "lap",   0, 1, 0),
        (east_four,  radians(-90),  LEAN_BACK, "lap",   1, 0, 0),
        (east_four,  radians(180),  LEAN_IN,   "table", 2, 2, 1),
        (east_two,   radians(180),  LEAN_IN,   "table", 3, 1, 0),
        (west_near,  0.0,           LEAN_BACK, "lap",   1, 2, 1),
        (west_near,  radians(180),  LEAN_BACK, "lap",   2, 0, 0),
    )
    for table_x, yaw, lean, arms, top, skin, hair in patrons:
        seat_x, seat_y = chair_at(table_x, seating_y, yaw)
        seated_patron(seat_x, seat_y, DECK_TOP, yaw, lean, arms, patron_skins[skin],
                      patron_hair[hair], patron_tops[top], patron_legs)
        if arms == "table":
            terrace_laptop(seat_x, seat_y, DECK_TOP, yaw, laptop_shell, laptop_screen)

    # Planter runs along the front of each deck, which is what bounds the terrace -- no railing,
    # no bollards, and it reads from directly above where a rail would not.
    for name, (x0, x1) in (("east deck planter", east_deck), ("west deck planter", west_deck)):
        hedge_box(name, x0, x1, deck_front, deck_front + 0.30, PAVING_TOP, pot, soil, leaves)

    # Standard bays flanking the entrance and closing each end of the frontage, under the awnings.
    for plant_x in (entry_left - 0.34, entry_right + 0.34,
                    west_deck[0] + 0.38, east_deck[1] - 0.38):
        potted_tree(plant_x, front + 0.36, PAVING_TOP, pot, soil, timber_dark, leaves)

    # The soft, rounded read of the whole kit comes from this pass. The lettering is deliberately
    # left flat: smoothing across a glyph's face-to-side edge blurs the letterforms.
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and not obj.name.startswith(LETTERING_NAME):
            for polygon in obj.data.polygons:
                polygon.use_smooth = True

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH))
    merge_by_material()
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
