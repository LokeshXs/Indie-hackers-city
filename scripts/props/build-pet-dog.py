"""The dog a founder earns at 390 XP, for the strip of lawn in front of their building.

The second asset in the kit that MOVES, so it inherits every departure build-pedestrian.py had to
make -- not merged by material, each part's origin on its own joint, authored at world scale -- and
adds one of its own.

IT IS THE FIRST ASSET WITH A NODE HIERARCHY. A walker's limbs are five siblings, because a walking
figure's torso never moves: only the limbs swing beneath it. A dog sitting down pitches its whole
chest up, and its head, ears and tail have to travel with it. Parenting them to the body is what
makes that one rotation at runtime instead of four transforms that have to be kept in agreement.

The four legs are deliberately NOT children of the body. A sitting dog folds its back legs and
leaves its front legs planted and vertical while the chest rises; legs inheriting the body's pitch
would tip over with it. So the body carries the head, ears and tail, and the legs hang off the
group the runtime makes.

THE BODY'S ORIGIN IS ON THE GROUND AT THE HIPS, not at the centre of the plot the dog stands on and
not at the middle of its own mass. Pitching about that point is the sit: the rump stays down, the
chest comes up, the back legs it is sitting on are right there. An origin at the body's centre
would see it rotate into the grass at one end and off it at the other.

SCALE IS WORLD SCALE, as it is for the pedestrians and for the same reason -- the dog is positioned
by lawn coordinates rather than by a plot, and the buildings' hidden 1.4 between the two would be a
trap. About 0.47 units at the ear, roughly a quarter of the 1.85 a walker stands, which is the
proportion a puppy has against an adult.

Authored facing +Y, which export_yup turns into -Z: the direction a three.js model faces at
rotation zero.
"""

from math import radians
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/props/pet-dog.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/props/pet-dog.glb"

# The pivots the runtime turns each part about. Every one is a joint, and each one is placed on the
# joint rather than at the middle of the part that turns about it -- see set_pivot below for why
# that distinction is the whole trick.
HIP_Z = 0.125                 # shoulder and hip height: the leg pivots
LEG_X = 0.062
FRONT_Y = 0.078
BACK_Y = -0.098
NECK = (0.0, 0.115, 0.310)
EAR_X = 0.105
EAR_Y = 0.180
EAR_Z = 0.455
TAIL = (0.0, -0.150, 0.245)

BODY_PIVOT = (0.0, BACK_Y, 0.0)

# How far the tail is cocked up and back off vertical. Applied to the geometry rather than left to
# the runtime: the wag is a turn about Y, so the tail has to already be leaning before it sweeps or
# it wags like a metronome instead of like a tail.
TAIL_COCK = 45


def material(name, color, roughness=0.72, metallic=0.0):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return value


def cube(name, location, scale, surface, bevel=0.0):
    """A box given as HALF-EXTENTS, matching the rest of the kit."""
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new("Rounded toy edge", "BEVEL")
        modifier.width = min(bevel, min(scale) * 0.8)
        modifier.segments = 2
    return obj


def sphere(name, location, radius, surface, subdivisions=3, scale=(1.0, 1.0, 1.0)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius,
                                          location=location)
    obj = bpy.context.object
    obj.name = name
    if scale != (1.0, 1.0, 1.0):
        obj.scale = scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
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

    A vertex sits at obj.location + v. Moving the origin to `pivot` has to hold that sum constant,
    so the mesh data shifts by exactly the distance the origin travelled, in the opposite
    direction. Without this a limb rotates about its own middle rather than about its joint."""
    pivot = Vector(pivot)
    obj.data.transform(Matrix.Translation(obj.location - pivot))
    obj.location = pivot


def parent_to(child, parent):
    """Hang `child` off `parent` without moving it.

    keep_transform matters: both origins have already been placed by set_pivot, and the default
    parenting would re-seat the child relative to the parent's origin -- dropping the head to the
    hips, which is exactly as wrong as it sounds."""
    bpy.ops.object.select_all(action="DESELECT")
    child.select_set(True)
    bpy.context.view_layer.objects.active = parent
    parent.select_set(True)
    bpy.ops.object.parent_set(type="OBJECT", keep_transform=True)
    bpy.ops.object.select_all(action="DESELECT")


def build_dog(coat, patch, muzzle_fur, nose_black, eye_black):
    """One dog: body, head, two ears, four legs and a tail, nine nodes for the runtime to find."""
    # Underscores, not spaces. three.js sanitises node names as it loads a glb -- whitespace
    # becomes "_" -- so a part named "leg front left" here arrives in the scene as
    # "leg_front_left" and every lookup by the authored name quietly finds nothing. Naming them
    # the sanitised way up front means the name in the file is the name at runtime.
    body = join_as("dog_body", [
        # Barrel. Wider than it is tall, and bevelled hard, because the reference is a soft toy
        # rather than an animal: at map zoom the silhouette is the whole of the read.
        cube("dog_torso", (0.0, -0.010, 0.215), (0.090, 0.125, 0.085), coat, 0.060),
        # Chest, proud of the barrel and a touch lower, so the front reads as a chest rather than
        # as the flat end of a box.
        sphere("dog_chest", (0.0, 0.095, 0.205), 0.086, coat, scale=(1.0, 0.80, 1.0)),
        # Haunch, the same trick at the other end, and the mass the sit pose settles onto.
        sphere("dog_haunch", (0.0, -0.120, 0.200), 0.092, coat, scale=(1.0, 0.78, 1.0)),
        # The neck belongs to the BODY, not the head. A head that turns has to turn against
        # something; without this the skull floats a clear gap above the chest from the side, which
        # is exactly how the first version of this model looked.
        cube("dog_neck", (0.0, 0.105, 0.288), (0.052, 0.048, 0.058), coat, 0.034),
    ])
    set_pivot(body, BODY_PIVOT)

    head = join_as("dog_head", [
        # Big, and carried high. A puppy's head is nearly the size of its chest and sits above the
        # shoulder line -- drop it level with the back and the whole thing reads as a piglet.
        sphere("dog_skull", (0.0, 0.165, 0.390), 0.125, coat),
        # The eye patch from the reference, one side only. A flattened sphere sitting proud of the
        # skull rather than a texture: the kit carries no UV maps anywhere, so a painted patch
        # would have to be its own mesh regardless.
        sphere("dog_patch", (-0.060, 0.248, 0.408), 0.062, patch, scale=(1.0, 0.70, 1.0)),
        # The snout has to CLEAR the skull it grows out of. At r = 0.125 the skull's front is at
        # y = 0.290, so a muzzle sunk behind that is a dog with no face -- which is what the first
        # pass shipped, and it was invisible from the side.
        cube("dog_muzzle", (0.0, 0.280, 0.352), (0.050, 0.060, 0.042), muzzle_fur, 0.032),
        sphere("dog_nose", (0.0, 0.345, 0.368), 0.030, nose_black, subdivisions=2),
        # Both eyes sit a whisker outside the skull so they read as beads rather than as holes,
        # and the patched one stands proud of its patch by the same trick.
        sphere("dog_eye_left", (-0.060, 0.286, 0.414), 0.024, eye_black, subdivisions=2),
        sphere("dog_eye_right", (0.060, 0.286, 0.414), 0.024, eye_black, subdivisions=2),
    ])
    set_pivot(head, NECK)
    parent_to(head, body)

    for side, dx in (("left", -EAR_X), ("right", EAR_X)):
        # Hung from the top of the skull and reaching well below it, which is the one feature that
        # makes the silhouette read as this dog and not as any small quadruped.
        ear = cube(f"dog_ear_{side}", (dx * 1.16, 0.168, 0.360), (0.034, 0.052, 0.098), patch, 0.026)
        set_pivot(ear, (dx, EAR_Y, EAR_Z))
        parent_to(ear, head)

    # Long on its own axis and thin on the other two. The first pass was 0.048 x 0.116 x 0.110 --
    # near enough a cube -- and read as a block balanced on the rump rather than as a tail.
    #
    # Centred so that cocking it puts the BASE inside the haunch: the rump is a squashed sphere
    # whose surface drops away fast toward the back, so a tail seated by eye at the height of the
    # spine ends up hanging behind the dog with daylight under it.
    tail = cube("dog_tail", (0.0, -0.2101, 0.3051), (0.020, 0.022, 0.085), coat, 0.016)
    # Cocked before the pivot moves, so the lean is baked into the geometry and the runtime's wag
    # stays a single turn about Y. Rotating about the object's own centre swings the base forward
    # into the haunch and the tip back and up, which is the shape wanted.
    tail.rotation_euler = (radians(TAIL_COCK), 0.0, 0.0)
    bpy.ops.object.select_all(action="DESELECT")
    tail.select_set(True)
    bpy.context.view_layer.objects.active = tail
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    set_pivot(tail, TAIL)
    parent_to(tail, body)

    for name, y in (("front", FRONT_Y), ("back", BACK_Y)):
        for side, dx in (("left", -LEG_X), ("right", LEG_X)):
            leg = join_as(f"dog_leg_{name}_{side}", [
                cube("dog_shank", (dx, y, HIP_Z / 2), (0.036, 0.038, HIP_Z / 2), coat, 0.028),
                # The paw, a shade wider and pushed forward, so a leg swinging through the stride
                # shows a foot rather than the end of a stick.
                cube("dog_paw", (dx, y + 0.010, 0.019), (0.040, 0.046, 0.019), coat, 0.016),
            ])
            set_pivot(leg, (dx, y, HIP_Z))


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    # The reference's palette, read as linear base colour. Warmer and lighter than anything else
    # on a plot: the dog is small and sits against mown grass, and a muted coat at this size
    # simply disappears into it.
    coat = material("Pet dog coat", (0.800, 0.470, 0.210))
    patch = material("Pet dog patch", (0.440, 0.150, 0.050))
    muzzle_fur = material("Pet dog muzzle", (0.880, 0.660, 0.400))
    nose_black = material("Pet dog nose", (0.020, 0.015, 0.015), roughness=0.42)
    eye_black = material("Pet dog eye", (0.015, 0.012, 0.012), roughness=0.30)

    build_dog(coat, patch, muzzle_fur, nose_black, eye_black)

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
