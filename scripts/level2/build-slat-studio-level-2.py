"""The first level-2 premises: a slat-clad studio with a stepped parapet and a glazed front room.

Three things here differ from the level-1 builders, and each is deliberate.

TRANSPARENT GLAZING. Every level-1 "glass" in this kit is an opaque emissive teal box with a dark
recess behind it faking depth. This one is really transparent, so the desks and laptops inside are
visible. The only thing the glTF exporter reads to decide alphaMode is the Principled BSDF's Alpha
socket -- verified on Blender 5.2.1 by exporting with blend_method left at its default and finding
"alphaMode": "BLEND" in the file regardless. blend_method is set anyway because it is what EEVEE
uses to render the preview stills; it has no effect on the export.

A HOLLOW FRONT ROOM. The level-1 buildings are solid blocks with windows drawn on. A transparent
wall needs an actual room behind it, so the mass is assembled from solid pieces AROUND a void
rather than carved out of one block -- no booleans, same primitive-stacking style as the rest of
the kit.

THE ROOM IS SHALLOW ON PURPOSE. The city camera looks down 35 degrees, so a sightline entering the
top of the glazing drops 0.7 per 1.0 of depth. Entering at ROOM_GLASS_TOP it reaches z 1.05 by the
back partition, which is why the partition, the desks and the laptops all sit low: everything above
that line is hidden behind the wall over the glass, and modelling it would be work nobody can see.

Footprint is held at the level-1 8.10 x 5.10. Buildings render at scale 1.4 on an 11.4-wide plot,
so 8.10 becomes 11.34 of 11.4 -- there is no room to grow sideways, only up and a little forward.
"""

from math import radians
from pathlib import Path

import bpy


# Nested one level deeper than the flat build scripts, so the repo root is parents[2].
ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/level2/slat-studio-level-2.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/level2/slat-studio-level-2.glb"

# The runtime recolours a building by matching this material name exactly, the way
# BUILDING_WALL_MATERIAL does for the level-1 assets in src/components/city-map/city-assets.ts.
# It is the render plane behind the battens, not the battens themselves: leaving the timber a fixed
# accent keeps the two-tone look at any founder colour, where recolouring the slats would flatten
# the whole building to a single hue.
WALL_MATERIAL = "Slat Studio Walls"
# Named distinctly so a future pass can exclude it from castShadow. ModelPreview sets castShadow on
# every mesh in an asset, and a transparent pane casting a solid shadow puts a dark slab through
# the room.
GLASS_MATERIAL = "Slat Studio Glazing"

DECK_TOP = 0.44          # floor level; everything structural starts here
MAIN_WALL_TOP = 3.90
MAIN_PARAPET_TOP = 4.62  # the tall half of the step
BAY_WALL_TOP = 2.75
BAY_PARAPET_TOP = 3.30   # the low half; the 0.85 drop is the stepped roofline
ROOM_GLASS_LOW = 0.60
ROOM_GLASS_TOP = 2.62
# The entrance sits back at the wall plane while the glass runs across the front of the bay. That
#0.34 of daylight between the two is the whole point: it gives the frontage relief, so the glazing
# reads as a surface standing proud and the door as something set into the building behind it.
DOOR_FACE = 2.16         # front face of the door leaf
DOOR_HALF_WIDTH = 0.62   # the opening is centred on x = 0
DOOR_HEAD = 2.44

# Where the roof billboard will stand. scripts/props/build-billboard.py is 3.00 wide, so the pad
# carries it with room to spare. Blender (x, y, z) exports as three (x, z, -y).
BILLBOARD_PAD_CENTRE = (0.0, -0.60)
BILLBOARD_PAD_TOP = 4.46


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
        # Small trim reads the same with two segments and roughly halves its triangle count.
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
    """The same box stated as bounds. Nearly every mass here is naturally described by the two
    corners it spans, and converting by hand at each call site is where sign errors creep in."""
    return cube(name,
                ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
                ((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2),
                surface, bevel)


def slat_run(name, surface, accent, axis, start, end, face, z_low, z_high, proud,
             pitch=0.22, width=0.075, gaps=()):
    """Vertical battens over a wall -- the building's signature.

    axis "x" marches the battens along X on a wall facing +/-Y; axis "y" marches along Y on a wall
    facing +/-X. `proud` is signed and says how far they stand off the wall plane, so the caller
    picks the outward direction. Every third batten takes the accent tone, which keeps the run from
    reading as a flat striped texture at a distance. `gaps` are spans to leave clear for doors
    and windows -- cladding crossing an opening reads as a broken model rather than as cladding."""
    if z_high - z_low <= 0 or end - start <= 0:
        raise ValueError(f"{name}: degenerate slat run "
                         f"({start}..{end}, z {z_low}..{z_high}) -- this silently renders as a row "
                         f"of inside-out specks rather than failing")
    count = max(1, int((end - start) // pitch))
    # Centre the run in its span so the end gaps match instead of leaving one fat gap at the end.
    margin = ((end - start) - count * pitch) / 2
    half_depth = abs(proud) / 2
    for index in range(count):
        centre = start + margin + pitch / 2 + index * pitch
        if any(low - width / 2 < centre < high + width / 2 for low, high in gaps):
            continue
        tone = accent if index % 3 == 1 else surface
        if axis == "x":
            location = (centre, face + proud / 2, (z_low + z_high) / 2)
            scale = (width / 2, half_depth, (z_high - z_low) / 2)
        else:
            location = (face + proud / 2, centre, (z_low + z_high) / 2)
            scale = (half_depth, width / 2, (z_high - z_low) / 2)
        cube(f"{name} batten {index + 1}", location, scale, tone, 0.012)


def glazing_bank(name, x0, x1, y, glass, frame, panes):
    """A run of glass with charcoal mullions between the panes and a frame top and bottom."""
    width = (x1 - x0) / panes
    for index in range(panes):
        px0 = x0 + index * width
        box(f"{name} pane {index + 1}", px0 + 0.045, px0 + width - 0.045, y - 0.03, y + 0.03,
            ROOM_GLASS_LOW + 0.05, ROOM_GLASS_TOP - 0.05, glass)
        if index:
            box(f"{name} mullion {index}", px0 - 0.05, px0 + 0.05, y - 0.06, y + 0.06,
                ROOM_GLASS_LOW, ROOM_GLASS_TOP, frame, 0.02)
    box(f"{name} head", x0 - 0.06, x1 + 0.06, y - 0.07, y + 0.07,
        ROOM_GLASS_TOP - 0.02, ROOM_GLASS_TOP + 0.10, frame, 0.025)
    box(f"{name} sill", x0 - 0.06, x1 + 0.06, y - 0.07, y + 0.07,
        ROOM_GLASS_LOW - 0.10, ROOM_GLASS_LOW + 0.02, frame, 0.025)
    box(f"{name} jamb west", x0 - 0.06, x0 + 0.05, y - 0.06, y + 0.06,
        ROOM_GLASS_LOW, ROOM_GLASS_TOP, frame, 0.02)
    box(f"{name} jamb east", x1 - 0.05, x1 + 0.06, y - 0.06, y + 0.06,
        ROOM_GLASS_LOW, ROOM_GLASS_TOP, frame, 0.02)


def workstation(x, floor, desk_top, desk_leg, laptop_body, screen, chair):
    """A desk with a laptop and a chair, sized and placed to sit under the 35-degree sightline."""
    box("desk top", x - 0.52, x + 0.52, 1.00, 1.56, floor + 0.26, floor + 0.32, desk_top, 0.02)
    for leg_x in (x - 0.46, x + 0.46):
        box("desk leg", leg_x - 0.04, leg_x + 0.04, 1.06, 1.14, floor, floor + 0.26, desk_leg)
        box("desk leg", leg_x - 0.04, leg_x + 0.04, 1.42, 1.50, floor, floor + 0.26, desk_leg)

    # Laptop: a base and a lid tipped back off its rear edge.
    box("laptop base", x - 0.17, x + 0.17, 1.14, 1.38, floor + 0.32, floor + 0.345, laptop_body, 0.012)
    lid = cube("laptop lid", (x, 1.155, floor + 0.46), (0.17, 0.012, 0.115), laptop_body, 0.01,
               rotation=(radians(-18), 0, 0))
    lid.location = (x, 1.20, floor + 0.45)
    cube("laptop screen", (x, 1.222, floor + 0.45), (0.152, 0.006, 0.098), screen, 0.0,
         rotation=(radians(-18), 0, 0))

    box("chair seat", x - 0.19, x + 0.19, 0.62, 1.00, floor + 0.20, floor + 0.26, chair, 0.02)
    box("chair back", x - 0.19, x + 0.19, 0.62, 0.68, floor + 0.26, floor + 0.62, chair, 0.02)
    cylinder("chair post", (x, 0.81, floor + 0.10), 0.035, 0.20, chair)


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    concrete = material("Cool stone foundation", (0.50, 0.49, 0.46), roughness=0.78)
    # Sampled from the reference render (sRGB #504639, converted to linear). This is the plane
    # seen through every batten gap; at its old near-white value the whole facade read washed out.
    walls = material(WALL_MATERIAL, (0.080, 0.061, 0.041))
    timber = material("Cedar batten", (0.604, 0.212, 0.054), roughness=0.66)
    timber_light = material("Sunlit batten", (0.823, 0.347, 0.078), roughness=0.62)
    # The reference splits three tones the old palette collapsed into two: roof planes are a
    # neutral mid-grey (#565859 -- lighter than they were, checked across five patches), the fascia
    # bands sit just under them, and the window frames are near-black (#252725). "Charcoal roof"
    # used to serve both the roof and the mullions, which cannot be both.
    charcoal = material("Charcoal roof", (0.093, 0.098, 0.100), roughness=0.56)
    charcoal_soft = material("Charcoal fascia", (0.068, 0.068, 0.065), roughness=0.60)
    charcoal_frame = material("Charcoal frame", (0.019, 0.020, 0.019), roughness=0.52)
    glass = material(GLASS_MATERIAL, (0.46, 0.62, 0.66), roughness=0.10, metallic=0.0, alpha=0.30)
    deck = material("Deck plank", (0.738, 0.337, 0.120), roughness=0.74)
    steel = material("Brushed roof unit", (0.55, 0.57, 0.60), roughness=0.34, metallic=0.45)
    # The interior carries a little emission because it sits in the building's own shadow with no
    # environment light in the scene. Kept low: the city Canvas takes three's default ACES tone
    # mapping, which rolls anything brighter off to a flat white.
    room_floor = material("Studio floor", (0.46, 0.33, 0.22), roughness=0.70)
    room_wall = material("Studio back wall", (0.90, 0.80, 0.62), emission=(0.34, 0.28, 0.20),
                         emission_strength=0.22)
    desk_top = material("Desk top", (0.82, 0.71, 0.53), roughness=0.62)
    desk_leg = material("Desk frame", (0.20, 0.21, 0.24), roughness=0.50)
    laptop_body = material("Laptop shell", (0.24, 0.26, 0.30), roughness=0.42)
    screen = material("Laptop screen", (0.50, 0.74, 0.86), emission=(0.34, 0.60, 0.76),
                      emission_strength=1.2)
    chair = material("Studio chair", (0.10, 0.44, 0.44), roughness=0.60)
    leaf = material("Studio plant", (0.10, 0.42, 0.18), roughness=0.66)

    # --- Ground: foundation under the building, planked deck across the front. ---
    box("foundation", -4.05, 4.05, -2.50, 2.65, 0.0, DECK_TOP, concrete, 0.10)
    box("deck edge", -4.05, 4.05, 1.60, 3.40, 0.18, DECK_TOP, deck, 0.06)
    plank_y = 1.60
    while plank_y < 3.36:
        box("deck plank", -4.03, 4.03, plank_y + 0.02, plank_y + 0.26, DECK_TOP - 0.03,
            DECK_TOP + 0.01, deck, 0.012)
        plank_y += 0.28
    box("entry step", -0.88, 0.88, 3.30, 3.72, 0.0, 0.30, deck, 0.05)
    box("entry step tread", -0.86, 0.86, 3.32, 3.70, 0.26, 0.32, deck, 0.02)

    # --- Solid mass, assembled around the front room rather than carved out of a block. ---
    box("rear mass", -3.99, 3.99, -2.40, 0.30, DECK_TOP, MAIN_WALL_TOP, walls, 0.05)
    box("room pier west", -3.99, -3.85, 0.30, 1.60, DECK_TOP, MAIN_WALL_TOP, walls, 0.04)
    box("room pier east", 3.85, 3.99, 0.30, 1.60, DECK_TOP, MAIN_WALL_TOP, walls, 0.04)
    box("wall over room", -3.85, 3.85, 0.30, 1.60, 2.75, MAIN_WALL_TOP, walls, 0.04)
    # The bay steps forward of the main block and stops lower, which is the notch in the roofline.
    box("bay pier west", -3.99, -3.85, 1.60, 2.55, DECK_TOP, BAY_WALL_TOP, walls, 0.04)
    box("bay pier east", 3.85, 3.99, 1.60, 2.55, DECK_TOP, BAY_WALL_TOP, walls, 0.04)
    box("bay head", -3.85, 3.85, 1.60, 2.55, ROOM_GLASS_TOP + 0.06, BAY_WALL_TOP, walls, 0.03)
    for sill_x0, sill_x1 in ((-3.85, -(DOOR_HALF_WIDTH + 0.16)), (DOOR_HALF_WIDTH + 0.16, 3.85)):
        box("bay sill", sill_x0, sill_x1, 2.35, 2.55, DECK_TOP, ROOM_GLASS_LOW - 0.06, walls, 0.03)

    # --- The room itself. ---
    box("room floor", -3.85, 3.85, 0.30, 2.55, DECK_TOP - 0.02, DECK_TOP + 0.06, room_floor)
    box("room back wall", -3.85, 3.85, 0.30, 0.42, DECK_TOP, 2.62, room_wall)
    box("room ceiling", -3.85, 3.85, 0.30, 2.55, 2.62, 2.72, charcoal_soft)
    for x in (-3.20, -1.85, 1.85, 3.20):
        workstation(x, DECK_TOP + 0.06, desk_top, desk_leg, laptop_body, screen, chair)
    cylinder("planter pot", (-3.60, 0.72, DECK_TOP + 0.20), 0.16, 0.28, chair)
    for dx, dz, radius in ((0.0, 0.46, 0.20), (-0.11, 0.36, 0.14), (0.12, 0.38, 0.15)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius,
                                              location=(-3.60 + dx, 0.72, DECK_TOP + dz))
        bpy.context.object.name = "planter foliage"
        bpy.context.object.data.materials.append(leaf)

    # --- Glazing. One unbroken wall of glass across the whole frontage. ---
    reveal = DOOR_HALF_WIDTH + 0.08
    glazing_bank("bay glazing west", -3.85, -reveal, 2.50, glass, charcoal_frame, 3)
    glazing_bank("bay glazing east", reveal, 3.85, 2.50, glass, charcoal_frame, 3)
    # Sliding doors read as the two right-hand panes: a taller frame and a pull handle.
    # --- The recessed entrance. ---
    # Reveals: the jambs and soffit of the alcove, in the wall material, so the eye reads real
    # thickness between the glass line and the door rather than a flat panel painted on.
    for jamb_x in (-reveal, reveal):
        inner = jamb_x - 0.08 if jamb_x > 0 else jamb_x + 0.08
        x0, x1 = sorted((jamb_x, inner))
        box("door reveal jamb", x0, x1, DOOR_FACE - 0.04, 2.55, DECK_TOP, DOOR_HEAD + 0.10,
            walls, 0.02)
    box("door reveal soffit", -reveal, reveal, DOOR_FACE - 0.04, 2.55, DOOR_HEAD + 0.06,
        ROOM_GLASS_TOP + 0.06, walls, 0.02)
    box("door threshold", -reveal, reveal, DOOR_FACE - 0.04, 2.55, DECK_TOP - 0.02, DECK_TOP + 0.03,
        charcoal_soft, 0.01)
    # The leaf itself: solid charcoal, deliberately opaque against the glass on either side.
    box("entrance frame", -DOOR_HALF_WIDTH - 0.06, DOOR_HALF_WIDTH + 0.06, DOOR_FACE - 0.10,
        DOOR_FACE - 0.02, DECK_TOP, DOOR_HEAD + 0.06, charcoal_frame, 0.02)
    box("entrance leaf", -DOOR_HALF_WIDTH, DOOR_HALF_WIDTH, DOOR_FACE - 0.04, DOOR_FACE,
        DECK_TOP + 0.03, DOOR_HEAD, charcoal, 0.025)
    cylinder("entrance pull", (DOOR_HALF_WIDTH - 0.16, DOOR_FACE + 0.05, 1.42), 0.026, 0.46, steel, 12)
    # --- Slat cladding over every solid face the camera can reach. ---
    slat_run("back", timber, timber_light, "x", -3.96, 3.96, -2.40, DECK_TOP + 0.06,
             MAIN_WALL_TOP - 0.06, -0.06, gaps=((-1.72, -0.58),))
    # The gap above is full height; the cladding resumes over the door canopy.
    slat_run("back over door", timber, timber_light, "x", -1.72, -0.58, -2.40, 2.60,
             MAIN_WALL_TOP - 0.06, -0.06)
    slat_run("west lower", timber, timber_light, "y", -2.37, 1.57, -3.99, DECK_TOP + 0.06,
             MAIN_WALL_TOP - 0.06, -0.06)
    slat_run("west bay", timber, timber_light, "y", 1.63, 2.52, -3.99, DECK_TOP + 0.06,
             BAY_WALL_TOP - 0.06, -0.06)
    slat_run("east", timber, timber_light, "y", -2.37, 1.57, 3.99, DECK_TOP + 0.06,
             MAIN_WALL_TOP - 0.06, 0.06)
    # The band above the bay roof is the face that sells the step, so it is clad too. It now runs
    # the full width, because the glass below it does.
    slat_run("front step face", timber, timber_light, "x", -3.96, 3.96, 1.60, BAY_PARAPET_TOP + 0.04,
             MAIN_WALL_TOP - 0.06, 0.06)
    slat_run("bay pier west face", timber, timber_light, "x", -3.96, -3.88, 2.55,
             DECK_TOP + 0.06, BAY_WALL_TOP - 0.06, 0.06)
    slat_run("bay pier east face", timber, timber_light, "x", 3.88, 3.96, 2.55,
             DECK_TOP + 0.06, BAY_WALL_TOP - 0.06, 0.06)

    # A service door and a meter box on the back wall. The city camera orbits the full circle,
    # so this face is seen as often as the sides; the door is what stops it reading as a blank
    # fence.
    box("service door frame", -1.74, -0.56, -2.52, -2.42, DECK_TOP, 2.42, charcoal_frame, 0.03)
    box("service door leaf", -1.66, -0.64, -2.56, -2.48, DECK_TOP + 0.04, 2.34, charcoal_soft, 0.03)
    cylinder("service door handle", (-0.80, -2.60, 1.42), 0.03, 0.26, steel, 12,
             rotation=(0, radians(90), 0))
    box("service door canopy", -1.86, -0.44, -2.74, -2.40, 2.42, 2.54, charcoal, 0.03)
    box("meter box", 1.35, 2.05, -2.54, -2.42, 1.15, 1.85, steel, 0.04)

    # --- Roofs: fascia band, slab, parapet upstand, at two heights. ---
    box("main fascia", -4.02, 4.02, -2.45, 1.65, MAIN_WALL_TOP, 4.14, charcoal_soft, 0.04)
    box("main roof", -4.05, 4.05, -2.52, 1.72, 4.14, 4.34, charcoal, 0.05)
    for name, x0, x1, y0, y1 in (
        ("main parapet back", -4.05, 4.05, -2.52, -2.38),
        ("main parapet front", -4.05, 4.05, 1.58, 1.72),
        ("main parapet west", -4.05, -3.91, -2.52, 1.72),
        ("main parapet east", 3.91, 4.05, -2.52, 1.72),
    ):
        box(name, x0, x1, y0, y1, 4.34, MAIN_PARAPET_TOP, charcoal, 0.035)

    box("bay fascia", -4.02, 4.02, 1.60, 2.60, BAY_WALL_TOP, 2.95, charcoal_soft, 0.04)
    box("bay roof", -4.05, 4.05, 1.60, 2.68, 2.95, 3.12, charcoal, 0.05)
    for name, x0, x1, y0, y1 in (
        ("bay parapet front", -4.05, 4.05, 2.54, 2.68),
        ("bay parapet west", -4.05, -3.91, 1.60, 2.68),
        ("bay parapet east", 3.91, 4.05, 1.60, 2.68),
    ):
        box(name, x0, x1, y0, y1, 3.12, BAY_PARAPET_TOP, charcoal, 0.035)

    # --- Roof furniture, and the pad the billboard will stand on. ---
    pad_x, pad_y = BILLBOARD_PAD_CENTRE
    box("billboard pad", pad_x - 1.70, pad_x + 1.70, pad_y - 0.90, pad_y + 0.90, 4.34,
        BILLBOARD_PAD_TOP, charcoal_soft, 0.04)
    box("roof unit", 2.45, 3.55, -1.85, -0.95, 4.34, 4.76, steel, 0.06)
    for offset in (-0.55, -0.30):
        box("roof unit vent", 2.55, 3.45, offset - 0.03, offset + 0.03, 4.42, 4.70, charcoal, 0.012)
    cylinder("roof flue", (-2.85, -1.60, 4.62), 0.10, 0.64, steel)

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
