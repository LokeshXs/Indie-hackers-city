"""The district's car, in four authored colourways.

A two-box hatchback: a rounded lower mass carrying the bonnet and boot decks, a cabin set back on
top of it, and glass that pokes a hair proud of the paint so the windows read as windows rather
than as painted-on panels.

FOUR CARS ARE BUILT, NOT ONE THAT IS TINTED. Same reason the pedestrians are authored rather than
recoloured: runtime colour replacement was taken out of this codebase because it swapped a named
material instead of tinting it, and on a mesh whose mass carried that material it erased the model.
Four bodies ship in the one glb and the runtime picks between them, so a car can only ever wear a
colour that was chosen here.

EACH COLOURWAY IS ONE MERGED NODE, unlike the pedestrian's five. A walker splits because its limbs
swing; a car's only animation is the route it drives, so nothing inside it ever moves on its own
and there is nothing to gain by keeping the wheels separate. Spinning them was considered and
dropped: a wheel is about two pixels across at map zoom, and the split would cost four extra nodes
on every car in the city to animate something no one can see.

SCALE IS WORLD SCALE, the pedestrians' 1.0584 units to the metre, so a figure on the pavement
stands about chest-high to a car's roof. Buildings are authored small and placed at 1.4; a car is
authored at its final size and placed at 1.0, because it is positioned by a route rather than by a
plot and a hidden multiplier between the two would be a trap.

WIDTH IS SET BY THE ROAD, not by the reference photo. A road-straight is 4.30 across, so a lane is
2.15 and a car centred in one has 1.075 either side of it. At 1.80m the body fills 1.90 of that
2.15, which is snug but correct -- these are narrow toy-city streets, and a car that looked right
in isolation would have looked parked on the centre line.

Authored facing +Y, which export_yup turns into -Z: the direction a three.js model faces at
rotation zero, and the direction `pointAt` returns headings for.
"""

from math import radians
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/vehicles/car.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/vehicles/car.glb"

# One metre, in world units -- the pedestrians' own scale, so the two read as the same city.
METRE = 1.0584

HALF_LENGTH = 2.15              # 4.06m nose to tail
HALF_WIDTH = 0.95               # 1.80m across the body
SILL = 0.34                     # underside of the visible body, level with the wheel centres
DECK_TOP = 0.90                 # bonnet and boot height
ROOF_TOP = 1.62                 # 1.53m overall
CABIN_FRONT = 0.10              # front of the ROOF, not of the glasshouse
CABIN_BACK = -1.60              # back of the roof; the tailgate leans out behind it
CABIN_HALF_WIDTH = 0.80         # narrower than the body, which is what leaves a shoulder
WHEEL_RADIUS = 0.35 * METRE
WHEEL_HALF_WIDTH = 0.205 * METRE / 2
AXLE_Y = 1.28                   # front and rear axles, giving a 2.42m wheelbase
TRACK = 0.845                   # wheel centres either side of the spine

# THE PROPORTIONS ARE SET BY THE MAP CAMERA, not by a photograph. The city is viewed down the
# [1,1,1] diagonal, 35 degrees above the horizon, which foreshortens everything vertical to about
# three fifths and flattens a correctly proportioned car into a plank. So the roof stands 1.53m
# rather than a hatchback's real 1.45m, the cabin is a full 0.72 of that rather than the slab a
# scale drawing gives, and the body stops level with the wheel centres so the bottom half of every
# wheel is out in the open. Measured against a real car each of those is slightly wrong; seen from
# where the city is actually seen from, they are what makes it read as a car at all.


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
        modifier.width = min(bevel, min(scale) * 0.8)
        modifier.segments = 3
    return obj


def wheel_cylinder(name, location, radius, width, surface, vertices=20):
    """A disc lying on its side: the primitive's axis is Z, so a quarter turn about Y aims it
    across the car, which is where an axle goes."""
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=width, location=location,
        rotation=(0, radians(90), 0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    return obj


def join_as(name, parts):
    """Join `parts` into one object called `name`, keeping every material slot.

    Blender's join() carries only the ACTIVE object's modifier stack, so the bevels have to be
    applied first or every part but one loses its rounding."""
    for obj in parts:
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    return joined


def set_pivot(obj, pivot):
    """Put the object's origin at `pivot` in world space, leaving the geometry where it is.

    A vertex sits at obj.location + v, so moving the origin has to shift the mesh data by exactly
    the distance the origin travelled, in the opposite direction. The car wants its origin on the
    road surface, because that is what a route hands it."""
    pivot = Vector(pivot)
    obj.data.transform(Matrix.Translation(obj.location - pivot))
    obj.location = pivot


def build_car(index, paint, trim, glass, tyre, hub, headlight, taillight):
    """One colourway, merged into a single node the runtime clones per car."""
    # Underscored, like the pedestrian's parts: three.js sanitises node names as it loads a glb,
    # turning whitespace into "_", so the name in the file is the name getObjectByName will match.
    tag = f"car_{index}"

    cabin_centre = (CABIN_FRONT + CABIN_BACK) / 2
    cabin_half = (CABIN_FRONT - CABIN_BACK) / 2
    belt = (DECK_TOP + ROOF_TOP) / 2

    parts = [
        # Sits between the wheels so the gap under the sill reads as shadow rather than as daylight.
        cube(f"{tag}_underbody", (0, 0, 0.28), (0.86, 1.95, 0.14), trim),
        # The main mass. Its top face is the bonnet forward of the cabin and the boot behind it, so
        # the whole two-box shape comes from this one box plus the cabin.
        cube(f"{tag}_body", (0, 0, (SILL + DECK_TOP) / 2),
             (HALF_WIDTH, HALF_LENGTH, (DECK_TOP - SILL) / 2), paint, 0.18),
        # Set back and narrowed, which is what leaves a shoulder to run the glass along. Its bevel
        # is the one number the glass depends on: at 0.20 the rounding ate so far into the flanks
        # that a window band sized to sit flush stood proud of them instead.
        cube(f"{tag}_cabin", (0, cabin_centre, (DECK_TOP + ROOF_TOP) / 2),
             (CABIN_HALF_WIDTH, cabin_half, (ROOF_TOP - DECK_TOP) / 2), paint, 0.13),
        # Wider than the cabin by 0.015 so it breaks the surface on both flanks, and kept between
        # the roof's two bevels so it breaks it by that much the whole way along.
        cube(f"{tag}_side_glass", (0, cabin_centre + 0.03, belt - 0.01),
             (CABIN_HALF_WIDTH + 0.015, cabin_half - 0.13, 0.20), glass, 0.03),
        # Raked back 40 degrees, its foot landing on the bonnet where a windscreen's does. Narrower
        # than the cabin, so the paint either side of it reads as the A-pillars. It leans out in
        # FRONT of the roof rather than sitting in its face -- which is what stops a two-box shape
        # from reading as a van: the roof is short and the glass is what lengthens the cabin.
        cube(f"{tag}_windscreen", (0, CABIN_FRONT - 0.02, belt), (0.72, 0.055, 0.40), glass,
             rotation=(radians(40), 0, 0)),
        # The tailgate, leaning the other way: bottom edge furthest back, over a stub of a boot.
        cube(f"{tag}_rear_glass", (0, CABIN_BACK + 0.02, belt), (0.72, 0.055, 0.36), glass,
             rotation=(radians(-34), 0, 0)),
        # The B-pillar, standing a hair proud of the glass it interrupts. Without it the side
        # windows are one unbroken slot from A-pillar to tailgate, which is the single thing that
        # most made this read as a van rather than as a car with doors.
        cube(f"{tag}_pillar", (0, cabin_centre + 0.27, belt),
             (CABIN_HALF_WIDTH + 0.03, 0.055, 0.20), paint),
        cube(f"{tag}_grille", (0, HALF_LENGTH, 0.55), (0.52, 0.04, 0.075), trim, 0.02),
    ]

    for end, y in (("front", HALF_LENGTH - 0.05), ("rear", -HALF_LENGTH + 0.05)):
        parts.append(cube(f"{tag}_{end}_valance", (0, y, 0.42), (0.90, 0.06, 0.08), trim, 0.03))

    for side in (-1, 1):
        parts.append(cube(f"{tag}_headlight", (side * 0.62, HALF_LENGTH - 0.03, 0.70),
                          (0.225, 0.06, 0.085), headlight, 0.03))
        parts.append(cube(f"{tag}_taillight", (side * 0.66, -HALF_LENGTH + 0.03, 0.74),
                          (0.20, 0.06, 0.10), taillight, 0.03))
        # Hung off the body's shoulder rather than the cabin: the cabin is narrower and its bevel
        # falls away here, so a mirror pinned to it would float free of the car.
        parts.append(cube(f"{tag}_mirror", (side * 0.87, CABIN_FRONT + 0.22, DECK_TOP - 0.01),
                          (0.11, 0.05, 0.045), paint, 0.025))

    for side in (-1, 1):
        for axle in (-1, 1):
            centre = (side * TRACK, axle * AXLE_Y, WHEEL_RADIUS)
            parts.append(wheel_cylinder(f"{tag}_tyre", centre, WHEEL_RADIUS,
                                        WHEEL_HALF_WIDTH * 2, tyre, vertices=18))
            # A shade wider than the tyre, so the face of the wheel shows from outside while its
            # inner end stays buried in the body.
            parts.append(wheel_cylinder(f"{tag}_wheel_face", centre, 0.245,
                                        WHEEL_HALF_WIDTH * 2.14, hub, vertices=14))

    car = join_as(tag, parts)
    # join() hands the joined object the FIRST part's origin -- the underbody, a third of a metre
    # up. The car wants its origin where its tyres meet the tarmac, so a route can seat it on the
    # road deck, and that has to be a pivot move: assigning location would drop the whole car.
    set_pivot(car, (0.0, 0.0, 0.0))
    return car


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    # Three of the four are the colours most cars actually are -- white, grey, blue -- and the
    # fourth is the reference photo's orange, kept as the one car in four that catches the eye.
    # Values are LINEAR, which is what Blender's Base Color and the exported glTF factor both are;
    # the orange in particular is dialled back from the photo, because a fully saturated body at
    # this size becomes the brightest thing on the map and pulls attention off the buildings.
    paints = [
        material("Car ember", (0.620, 0.105, 0.028), roughness=0.42),
        material("Car harbour", (0.035, 0.095, 0.235), roughness=0.42),
        material("Car bone", (0.800, 0.750, 0.660), roughness=0.46),
        material("Car slate", (0.210, 0.240, 0.270), roughness=0.42),
    ]
    # Shared across every colourway, so four cars cost four paints and not four of everything.
    trim = material("Car trim", (0.030, 0.038, 0.045), roughness=0.60)
    # Metallic is kept near zero throughout: the map lights with a hemisphere and a sun and carries
    # no environment map, and a metal with nothing to reflect renders black.
    glass = material("Car glass", (0.012, 0.024, 0.036), roughness=0.20, metallic=0.08)
    tyre = material("Car tyre", (0.018, 0.018, 0.020), roughness=0.90)
    hub = material("Car wheel face", (0.520, 0.550, 0.580), roughness=0.30, metallic=0.15)
    headlight = material("Car headlight", (0.850, 0.860, 0.800), roughness=0.15,
                         emission=(0.55, 0.55, 0.48), emission_strength=0.45)
    taillight = material("Car taillight", (0.450, 0.030, 0.020), roughness=0.20,
                         emission=(0.42, 0.02, 0.01), emission_strength=0.45)

    for index, paint in enumerate(paints):
        build_car(index, paint, trim, glass, tyre, hub, headlight, taillight)

    # Smooth throughout, like the rest of the kit -- and more right here than anywhere else in it,
    # because a car body genuinely is a smooth surface.
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
