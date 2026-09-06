"""The second level-2 premises: a two-storey charcoal cube with a teal brow and a recessed porch.

Three things here are new to this kit.

THE FIRST GENUINELY TWO-STOREY BUILDING. Every other asset, including the level-2 slat studio, is
one floor. Measuring the shipped GLBs' world bounds, the slat studio (4.94) is actually SHORTER
than the corner studio (5.71) and the garage (5.27) -- so the "bigger building" reward has been
delivering the second-smallest thing in the city. At 7.20 this is 26% taller than the tallest
level-1 building, which is the first time that promise is legible from across the map.

Height is bounded from above by two things, neither of them the renderer: the launch monument is
10.63 world units and should stay the tallest thing in the city (7.20 x 1.4 = 10.08 slips under
it), and a building screens 1.4x its own height of ground behind it at the default camera pitch.

THE BROW IS A BEAM, NOT A SOFFIT. In the reference the teal band is the underside of the roof
overhang. The city camera looks DOWN 35 degrees, so an underside is never visible -- modelled
faithfully, the building's one accent would vanish the moment it left the inspector. So the brow
projects from under the roof edge as a beam with a vertical front face, which is what reads from
above while still sitting in the roof's shadow line the way the reference's does.

TWO INTERIORS. The 35-degree sightline that keeps ground-floor rooms shallow (0.7 of headroom per
1.0 of depth) is much kinder upstairs, because the sightline enters the upper glass far higher.
The ground room is shallow like the slat studio's; the upper room can afford real depth.

Footprint is 8.10 wide including the roof overhang -- walls are pulled in to 7.80 so the slab can
project without the building exceeding 11.34 of its 11.4 plot at scale 1.4.
"""

from math import radians
from pathlib import Path

import bpy


# Nested one level deeper than the flat build scripts, so the repo root is parents[2].
ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/level2/teal-brow-level-2.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/level2/teal-brow-level-2.glb"

# The stone-grey mass. Nothing recolours it: founder-chosen building colours were removed from the
# app entirely, so the palette authored here is the one that ships. The name is kept for legibility
# and because the GLB already ships with it.
WALL_MATERIAL = "Teal Brow Walls"
# Named distinctly so the transparent-material shadow skip in ModelPreview keeps finding it.
GLASS_MATERIAL = "Teal Brow Glazing"

# --- Massing. Authored Z-up, z = 0 at ground, front facing +Y, origin at footprint centre. ---
# Handedness matters here and is easy to get backwards. Standing in front of the building (at +Y,
# looking toward -Y) the viewer's LEFT is +X. The reference puts the entrance on the viewer's left,
# so the door sits at POSITIVE x and the glazing runs negative -- the opposite of what reading the
# reference's pixel coordinates left-to-right would suggest.
WALL_X = 3.90            # walls stop here; the roof slab projects to 4.05
ROOF_X = 4.05            # hard cap: 4.05 * 2 * 1.4 = 11.34 of an 11.4 plot
WALL_BACK = -2.80
WALL_FRONT = 2.80        # the upper storey's front face
ROOF_BACK = -2.95
ROOF_FRONT = 3.05

PLINTH_TOP = 0.45        # ground floor level; the entrance steps climb to this
GROUND_TOP = 3.45        # underside of the upper storey
UPPER_TOP = 6.60         # underside of the roof slab
ROOF_TOP = 7.20

PORCH_FRONT = 1.55       # the ground storey's front wall, set back under the storey above
GROUND_GLASS_LOW = 0.95
GROUND_GLASS_TOP = 2.95
UPPER_GLASS_LOW = 3.60   # just clear of the floor slab band
UPPER_GLASS_TOP = 6.40   # just under the brow


def material(name, color, roughness=0.72, metallic=0.0, emission=None, emission_strength=0.65,
             alpha=1.0, cull_backfaces=False):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, alpha)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emission:
        shader.inputs["Emission Color"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        shader.inputs["Alpha"].default_value = alpha
        # For EEVEE's preview render only -- the exporter reads the Alpha socket, not this.
        value.blend_method = "BLEND"
        # Exports as doubleSided: false. A thin pane blended from both sides sorts against itself.
        value.use_backface_culling = True
    if cull_backfaces:
        value.use_backface_culling = True
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
        modifier = obj.modifiers.new("Rounded collectible edge", "BEVEL")
        # A bevel wider than the thinnest half-extent self-intersects and the face silently
        # collapses on export, so trim thin trim pieces back to a width they can carry.
        modifier.width = min(bevel, min(scale) * 0.8)
        modifier.segments = 3 if modifier.width >= 0.04 else 2
    return obj


def cylinder(name, location, radius, depth, surface, vertices=16, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    return obj


def box(name, x0, x1, y0, y1, z0, z1, surface, bevel=0.0):
    """The same box stated as bounds, which is how nearly every mass here is described."""
    return cube(name,
                ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
                ((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2),
                surface, bevel)


def glazing_bank(name, x0, x1, y, z_low, z_high, glass, frame, panes):
    """A run of glass with dark mullions between the panes and a frame top and bottom.

    Carried over from the slat studio, with the z band promoted to arguments: this building has two
    glazed storeys at different heights, so the module-level constants that version relied on
    cannot serve both."""
    width = (x1 - x0) / panes
    for index in range(panes):
        px0 = x0 + index * width
        box(f"{name} pane {index + 1}", px0 + 0.045, px0 + width - 0.045, y - 0.03, y + 0.03,
            z_low + 0.05, z_high - 0.05, glass)
        if index:
            box(f"{name} mullion {index}", px0 - 0.05, px0 + 0.05, y - 0.06, y + 0.06,
                z_low, z_high, frame, 0.02)
    box(f"{name} head", x0 - 0.06, x1 + 0.06, y - 0.07, y + 0.07,
        z_high - 0.02, z_high + 0.10, frame, 0.025)
    box(f"{name} sill", x0 - 0.06, x1 + 0.06, y - 0.07, y + 0.07,
        z_low - 0.10, z_low + 0.02, frame, 0.025)
    box(f"{name} jamb west", x0 - 0.06, x0 + 0.05, y - 0.06, y + 0.06, z_low, z_high, frame, 0.02)
    box(f"{name} jamb east", x1 - 0.05, x1 + 0.06, y - 0.06, y + 0.06, z_low, z_high, frame, 0.02)


def workstation(x, floor, y_front, desk_top, desk_leg, laptop_body, screen, chair):
    """A desk with a laptop and a chair. `y_front` is the desk's near edge, so the same furniture
    serves the shallow ground room and the deeper upper one."""
    back, front = y_front - 0.56, y_front
    box("desk top", x - 0.52, x + 0.52, back, front, floor + 0.26, floor + 0.32, desk_top, 0.02)
    for leg_x in (x - 0.46, x + 0.46):
        box("desk leg", leg_x - 0.04, leg_x + 0.04, back + 0.06, back + 0.14, floor, floor + 0.26, desk_leg)
        box("desk leg", leg_x - 0.04, leg_x + 0.04, front - 0.14, front - 0.06, floor, floor + 0.26, desk_leg)

    # Laptop: a base and a lid tipped back off its rear edge.
    box("laptop base", x - 0.17, x + 0.17, back + 0.14, back + 0.38, floor + 0.32, floor + 0.345,
        laptop_body, 0.012)
    lid = cube("laptop lid", (x, back + 0.155, floor + 0.46), (0.17, 0.012, 0.115), laptop_body, 0.01,
               rotation=(radians(-18), 0, 0))
    lid.location = (x, back + 0.20, floor + 0.45)
    cube("laptop screen", (x, back + 0.222, floor + 0.45), (0.152, 0.006, 0.098), screen, 0.0,
         rotation=(radians(-18), 0, 0))

    box("chair seat", x - 0.19, x + 0.19, back - 0.38, back, floor + 0.20, floor + 0.26, chair, 0.02)
    box("chair back", x - 0.19, x + 0.19, back - 0.38, back - 0.32, floor + 0.26, floor + 0.62, chair, 0.02)
    cylinder("chair post", (x, back - 0.19, floor + 0.10), 0.035, 0.20, chair)


def meeting_table(x, y, floor, top_surface, leg_surface, chair):
    """The upper floor's centrepiece. Deeper than anything on the ground floor because the
    sightline through the upper glass enters high enough to reach the back of the room."""
    box("meeting top", x - 0.95, x + 0.95, y - 0.62, y + 0.62, floor + 0.30, floor + 0.36,
        top_surface, 0.025)
    for leg_x, leg_y in ((x - 0.82, y - 0.50), (x + 0.82, y - 0.50), (x - 0.82, y + 0.50), (x + 0.82, y + 0.50)):
        box("meeting leg", leg_x - 0.045, leg_x + 0.045, leg_y - 0.045, leg_y + 0.045,
            floor, floor + 0.30, leg_surface)
    for seat_x, seat_y in ((x - 0.50, y - 0.98), (x + 0.50, y - 0.98), (x - 0.50, y + 0.98), (x + 0.50, y + 0.98)):
        box("meeting chair seat", seat_x - 0.19, seat_x + 0.19, seat_y - 0.19, seat_y + 0.19,
            floor + 0.20, floor + 0.26, chair, 0.02)
        back_y = seat_y - 0.19 if seat_y > y else seat_y + 0.13
        box("meeting chair back", seat_x - 0.19, seat_x + 0.19, back_y, back_y + 0.06,
            floor + 0.26, floor + 0.60, chair, 0.02)


def person(x, y, floor, facing, shirt, skin):
    """A seated figure, built from rounded boxes like everything else in the kit rather than from
    a sphere -- the city's own characters read as blocks, and a smooth head would look imported.

    `facing` is +1 for someone facing +Y and -1 for -Y; it only swings the thighs, which is the one
    part that has to point at the table rather than through it."""
    seat = floor + 0.26
    thigh_y0, thigh_y1 = sorted((y + 0.02 * facing, y + 0.32 * facing))
    box("person thighs", x - 0.16, x + 0.16, thigh_y0, thigh_y1, seat, seat + 0.13, shirt, 0.04)
    box("person hips", x - 0.16, x + 0.16, y - 0.14, y + 0.14, seat, seat + 0.20, shirt, 0.04)
    box("person torso", x - 0.15, x + 0.15, y - 0.12, y + 0.12, seat + 0.20, seat + 0.56, shirt, 0.05)
    for arm_x in (x - 0.19, x + 0.19):
        box("person arm", arm_x - 0.045, arm_x + 0.045, y - 0.08, y + 0.10, seat + 0.22, seat + 0.50,
            shirt, 0.03)
    box("person head", x - 0.115, x + 0.115, y - 0.105, y + 0.105, seat + 0.58, seat + 0.82, skin, 0.055)


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    # --- Palette. A deliberate departure from the reference, which is a near-black charcoal.
    #
    # Authored at the reference's own #3b3936 this building rendered almost as a silhouette: under
    # the city's rig (hemisphere 1.35 + directional 2.65, no ambient at all) a shaded face receives
    # only ~0.7 of the light a lit one does, and ACES then compresses that to #272522. The walls are
    # a warm stone grey instead, which puts the shaded faces at #77736b -- still a modern neutral,
    # but a surface rather than a hole. The other tones move with it so the relationships hold:
    # the slab stays a step below the walls, the frames and the niche stay dark enough to read as
    # openings, and the teal brow keeps its contrast. ---
    walls = material(WALL_MATERIAL, (0.190, 0.178, 0.160), roughness=0.68)
    charcoal_roof = material("Brow roof slab", (0.150, 0.142, 0.130), roughness=0.58)
    charcoal_frame = material("Brow window frame", (0.022, 0.022, 0.020), roughness=0.50)
    charcoal_deep = material("Brow deep recess", (0.016, 0.015, 0.014), roughness=0.80)
    steps = material("Brow entrance steps", (0.120, 0.115, 0.105), roughness=0.76)
    # Storefront teal, lifted verbatim from build-startup-building-level-1.py so the accent is one
    # the city already speaks. It carries the brow and the door -- the building's only colour.
    teal = material("Brow teal accent", (0.055, 0.39, 0.44), roughness=0.55)
    glass = material(GLASS_MATERIAL, (0.46, 0.62, 0.66), roughness=0.10, alpha=0.30)
    steel = material("Brow brushed steel", (0.55, 0.57, 0.60), roughness=0.34, metallic=0.45)
    lamp = material("Brow wall light", (0.92, 0.90, 0.84), roughness=0.36,
                    emission=(0.95, 0.86, 0.62), emission_strength=0.9)
    # The whiteboard carries a little emission for the same reason the interiors do: it hangs on a
    # back wall in the building's own shadow, and a pure white albedo there still renders grey.
    board = material("Brow whiteboard", (0.88, 0.88, 0.86), roughness=0.42,
                     emission=(0.55, 0.55, 0.54), emission_strength=0.30)
    skin = material("Brow figure skin", (0.62, 0.44, 0.32), roughness=0.70)
    shirt_a = material("Brow shirt teal", (0.055, 0.39, 0.44), roughness=0.66)
    shirt_b = material("Brow shirt clay", (0.42, 0.14, 0.11), roughness=0.66)
    shirt_c = material("Brow shirt indigo", (0.09, 0.16, 0.36), roughness=0.66)

    # Interiors sit in the building's own shadow with no environment light, so they carry a little
    # emission. Kept low: the city Canvas takes three's default ACES tone map, which rolls anything
    # brighter off to a flat white.
    room_floor = material("Brow room floor", (0.20, 0.19, 0.18), roughness=0.74)
    room_wall = material("Brow room wall", (0.62, 0.58, 0.52), emission=(0.26, 0.24, 0.20),
                         emission_strength=0.20)
    desk_top = material("Brow desk top", (0.72, 0.66, 0.56), roughness=0.62)
    desk_leg = material("Brow desk frame", (0.10, 0.10, 0.11), roughness=0.50)
    laptop_body = material("Brow laptop shell", (0.16, 0.17, 0.19), roughness=0.42)
    screen = material("Brow laptop screen", (0.50, 0.74, 0.86), emission=(0.34, 0.60, 0.76),
                      emission_strength=1.2)
    chair = material("Brow chair", (0.055, 0.39, 0.44), roughness=0.60)
    leaf = material("Brow plant", (0.10, 0.42, 0.18), roughness=0.66)

    # --- Plinth and the porch slab. ---
    box("plinth", -WALL_X - 0.06, WALL_X + 0.06, WALL_BACK - 0.06, WALL_FRONT + 0.06, 0.0,
        PLINTH_TOP, steps, 0.05)
    box("porch slab", -WALL_X, WALL_X, PORCH_FRONT, WALL_FRONT, PLINTH_TOP - 0.02, PLINTH_TOP + 0.03,
        steps, 0.02)

    # --- Ground storey. Its front wall is set back to PORCH_FRONT, so the storey above oversails
    # it -- that recess, not any applied detail, is what gives the frontage depth. ---
    box("ground rear mass", -WALL_X, WALL_X, WALL_BACK, -0.10, PLINTH_TOP, GROUND_TOP, walls, 0.05)
    box("ground east return", 2.95, WALL_X, -0.10, PORCH_FRONT, PLINTH_TOP, GROUND_TOP, walls, 0.05)
    box("ground west return", -WALL_X, -3.75, -0.10, PORCH_FRONT, PLINTH_TOP, GROUND_TOP, walls, 0.04)
    box("ground head", -3.75, 2.95, -0.10, PORCH_FRONT, GROUND_GLASS_TOP + 0.08, GROUND_TOP, walls, 0.04)
    box("ground sill band", -3.75, 0.80, PORCH_FRONT - 0.20, PORCH_FRONT, PLINTH_TOP,
        GROUND_GLASS_LOW - 0.06, walls, 0.03)
    # The pier between the entrance and the sliding doors.
    box("ground entrance pier", 0.80, 1.00, -0.10, PORCH_FRONT, PLINTH_TOP, GROUND_GLASS_TOP + 0.08,
        walls, 0.03)

    # --- Ground room. Shallow, for the same reason the slat studio's is. ---
    box("ground room floor", -3.75, 0.80, -0.05, PORCH_FRONT, PLINTH_TOP - 0.02, PLINTH_TOP + 0.06,
        room_floor)
    box("ground room back wall", -3.75, 0.80, -0.05, 0.06, PLINTH_TOP, GROUND_GLASS_TOP, room_wall)
    box("ground room ceiling", -3.75, 0.80, -0.05, PORCH_FRONT, GROUND_GLASS_TOP,
        GROUND_GLASS_TOP + 0.08, charcoal_deep)
    for x in (-0.20, -1.55, -2.90):
        workstation(x, PLINTH_TOP + 0.06, 1.16, desk_top, desk_leg, laptop_body, screen, chair)

    # --- The entrance, inside the porch. Teal door, wall light beside it. ---
    # The bay the door sits in. Without this the frame floats in a hole: the pier stops at x 1.00
    # and the east return starts at 2.95, so everything between was open to the interior.
    box("entrance bay wall", 1.00, 2.95, -0.10, PORCH_FRONT, PLINTH_TOP, GROUND_GLASS_TOP + 0.08,
        walls, 0.04)
    # Each layer clears the one behind it by 0.02-0.03. Coplanar faces are what made the door
    # flicker: the frame and the leaf previously both ended at PORCH_FRONT - 0.02, so the depth
    # buffer had no way to order them and the two fought pixel by pixel.
    box("entrance frame", 1.36, 2.86, PORCH_FRONT - 0.02, PORCH_FRONT + 0.04, PLINTH_TOP, 2.86,
        charcoal_frame, 0.02)
    box("entrance leaf", 1.42, 2.80, PORCH_FRONT + 0.02, PORCH_FRONT + 0.07, PLINTH_TOP + 0.03,
        2.80, teal, 0.025)
    # The reference's door is grooved. These stand proud of the leaf rather than being cut into it:
    # a recess would need its own faces behind the leaf's, which is the same fight again.
    for groove_x in (2.62, 2.42, 2.22, 2.02, 1.82, 1.62):
        box("entrance groove", groove_x - 0.011, groove_x + 0.011, PORCH_FRONT + 0.055,
            PORCH_FRONT + 0.082, PLINTH_TOP + 0.06, 2.76, charcoal_deep)
    cylinder("entrance pull", (1.54, PORCH_FRONT + 0.13, 1.55), 0.024, 0.34, steel, 12)
    box("porch wall light", 3.10, 3.20, PORCH_FRONT - 0.06, PORCH_FRONT + 0.02, 1.90, 2.28,
        lamp, 0.02)

    # --- Ground glazing: a narrow sidelight, then the sliding doors. ---
    glazing_bank("ground sidelight", 0.20, 0.78, PORCH_FRONT - 0.06, GROUND_GLASS_LOW,
                 GROUND_GLASS_TOP, glass, charcoal_frame, 1)
    glazing_bank("ground slider", -3.72, 0.16, PORCH_FRONT - 0.06, GROUND_GLASS_LOW,
                 GROUND_GLASS_TOP, glass, charcoal_frame, 2)

    # --- Entrance steps, three treads down from the porch. ---
    for index, (z0, z1) in enumerate(((0.0, 0.15), (0.15, 0.30), (0.30, PLINTH_TOP))):
        inset = index * 0.22
        box(f"entrance step {index + 1}", 1.30, 2.95, WALL_FRONT + 0.06,
            WALL_FRONT + 0.72 - inset, z0, z1, steps, 0.03)

    # --- Upper storey. Full footprint, oversailing the porch. ---
    box("upper rear mass", -WALL_X, WALL_X, WALL_BACK, -0.10, GROUND_TOP, UPPER_TOP, walls, 0.05)
    # The front of the upper storey is now nothing but glass between two thin piers -- no head
    # band, no sill band. That is what makes the conference room read from the street.
    box("upper west pier", -WALL_X, -3.78, -0.10, WALL_FRONT, GROUND_TOP, UPPER_TOP, walls, 0.04)
    box("upper east pier", 3.78, WALL_X, -0.10, WALL_FRONT, GROUND_TOP, UPPER_TOP, walls, 0.04)
    box("upper front head", -3.78, 3.78, -0.10, WALL_FRONT, UPPER_GLASS_TOP + 0.06, UPPER_TOP,
        walls, 0.03)
    # The floor slab reads as a band between the storeys, and stops the porch from looking open.
    box("floor slab", -WALL_X - 0.04, WALL_X + 0.04, WALL_BACK, WALL_FRONT + 0.04, GROUND_TOP - 0.16,
        GROUND_TOP, charcoal_roof, 0.03)

    # --- Upper room. Deeper than the ground floor: the sightline through this glass enters high. ---
    box("upper room floor", -3.78, 3.78, -0.05, WALL_FRONT, GROUND_TOP, GROUND_TOP + 0.08, room_floor)
    box("upper room back wall", -3.78, 3.78, -0.05, 0.06, GROUND_TOP, UPPER_GLASS_TOP, room_wall)
    box("upper room ceiling", -3.78, 3.78, -0.05, WALL_FRONT, UPPER_GLASS_TOP,
        UPPER_GLASS_TOP + 0.06, charcoal_deep)
    # The whiteboard, on a short partition rather than on the back wall.
    #
    # The back wall is the obvious place and the wrong one. The brow projects to y 3.01 at z 6.26,
    # so a sightline over its front edge drops 0.70 per 1.0 of depth: by the back wall, 3.0 units
    # away, it has fallen to z 4.19 at the city's 35 degrees, and everything above that is behind
    # the overhang. A board hung there at readable height is a sliver no matter how it is sized.
    # Standing it on a partition 1.6 units nearer the glass lifts the same sightline to z 5.16, so
    # the whole board clears it. The partition occupies the east third, clear of the table.
    box("meeting partition", 1.15, 3.55, 1.24, 1.36, GROUND_TOP + 0.08, 5.10, room_wall, 0.03)
    box("whiteboard frame", 1.25, 3.45, 1.34, 1.41, 3.86, 4.94, charcoal_frame, 0.02)
    box("whiteboard face", 1.32, 3.38, 1.39, 1.44, 3.93, 4.87, board, 0.015)
    for mark_x, mark_z0, mark_z1 in ((1.52, 4.50, 4.76), (1.52, 4.10, 4.34), (2.46, 4.50, 4.68)):
        box("whiteboard mark", mark_x, mark_x + 0.66, 1.43, 1.465, mark_z0, mark_z1, teal, 0.0)
    meeting_table(-0.90, 1.40, GROUND_TOP + 0.08, desk_top, desk_leg, chair)
    # Four seated figures, one per chair. The upper room is the only place in the kit deep enough
    # to show people: the 35-degree sightline enters this glass high, so the far side of the table
    # is still visible where a ground-floor room would have hidden it behind its own head band.
    for seat_x, seat_y, shirt in ((-1.40, 0.42, shirt_a), (-0.40, 0.42, shirt_b),
                                  (-1.40, 2.38, shirt_c), (-0.40, 2.38, shirt_a)):
        person(seat_x, seat_y, GROUND_TOP + 0.08, 1 if seat_y < 1.40 else -1, shirt, skin)
    cylinder("planter pot", (3.20, 2.24, GROUND_TOP + 0.26), 0.17, 0.30, chair)
    for dx, dy, radius in ((0.0, 0.0, 0.22), (-0.12, 0.10, 0.15), (0.13, -0.08, 0.16)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius,
                                              location=(3.20 + dx, 2.24 + dy, GROUND_TOP + 0.58))
        bpy.context.object.name = "planter foliage"
        bpy.context.object.data.materials.append(leaf)

    # --- Upper glazing: the whole frontage, floor to brow. ---
    glazing_bank("upper glazing", -3.76, 3.76, WALL_FRONT - 0.08, UPPER_GLASS_LOW, UPPER_GLASS_TOP,
                 glass, charcoal_frame, 5)
    # --- Roof slab, and the brow beneath its front edge. ---
    box("roof slab", -ROOF_X, ROOF_X, ROOF_BACK, ROOF_FRONT, UPPER_TOP, ROOF_TOP, charcoal_roof, 0.05)
    # The brow. In the reference this is the timber lining of the roof's underside; here it is a
    # beam with a vertical face, because the city camera looks down and never sees a soffit.
    box("teal brow", -ROOF_X + 0.06, ROOF_X - 0.06, WALL_FRONT + 0.02, ROOF_FRONT - 0.04,
        UPPER_TOP - 0.34, UPPER_TOP, teal, 0.03)
    # It returns a little way down both flanks, so the accent survives a three-quarter view.
    for side in (-1, 1):
        x_outer = side * (ROOF_X - 0.06)
        x_inner = side * (ROOF_X - 0.30)
        x0, x1 = sorted((x_outer, x_inner))
        box("teal brow return", x0, x1, -1.20, WALL_FRONT + 0.02, UPPER_TOP - 0.34, UPPER_TOP,
            teal, 0.03)

    # --- Roof furniture. Deliberately squat: the roof slab tops out at 7.20, which is 10.08 world
    # at scale 1.4, and the launch monument at 10.63 should stay the tallest thing in the city.
    # A taller unit and flue put this building at 10.81 and quietly took that title. ---
    box("roof unit", -3.10, -1.90, -2.30, -1.30, ROOF_TOP, ROOF_TOP + 0.24, steel, 0.05)
    cylinder("roof flue", (2.40, -1.90, ROOF_TOP + 0.14), 0.09, 0.28, steel)

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
