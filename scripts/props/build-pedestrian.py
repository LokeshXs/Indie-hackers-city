"""Pedestrians for the city's pavements, in six authored colourways.

Three things here depart from every other build script in the kit, all forced by the fact that
this is the first asset that MOVES.

IT IS NOT MERGED BY MATERIAL. Every other model collapses to one mesh per material on export,
because nothing in it ever moves independently. A walker's legs and arms have to swing, so each
limb ships as its own glTF node for the runtime to rotate. Parts are still joined WITHIN
themselves -- a leg is one object carrying its trouser and shoe slots -- so the saving is kept
everywhere it costs nothing.

EACH LIMB'S ORIGIN SITS ON ITS JOINT. A glTF node rotates about its own origin, so a leg whose
origin sat at its centre would scissor around its knee instead of swinging from the hip. set_pivot
moves the origin onto the hip or the shoulder without moving the geometry, which is what makes the
runtime's job a single rotation per limb.

THE COLOURWAYS ARE AUTHORED, NOT TINTED. Runtime colour replacement was taken out of this codebase
for a good reason -- it swapped a named material rather than tinting it, and on a shell whose mass
carried that material it erased the building. Six figures are built into the one glb instead and
the runtime picks between them, so a walker can only ever wear a palette that was authored here.

SCALE IS WORLD SCALE. Buildings are authored small and placed at 1.4; a walker is placed at 1.0
and authored at its final size, because it is positioned by a route rather than by a plot and a
hidden multiplier between the two would be a trap. The numbers below are the terrace patrons' own
proportions taken through that 1.4, so a figure on the pavement and one in a cafe chair match:
about 1.0584 world units to the metre, making a 1.75m adult 1.85 units tall.

Authored facing +Y, which export_yup turns into -Z: the direction a three.js model faces at
rotation zero.
"""

from math import radians
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/props/pedestrian.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/props/pedestrian.glb"

# One metre, in world units. 0.756 authored units per metre through the buildings' 1.4 placement.
METRE = 1.0584

HIP_Z = 0.90 * METRE            # the leg pivot
SHOULDER_Z = 1.45 * METRE       # the arm pivot
WAIST_Z = 1.05 * METRE
CHEST_TOP = 1.48 * METRE
HEAD_Z = 1.63 * METRE
HEAD_RADIUS = 0.105 * METRE
LEG_SPREAD = 0.105
ARM_SPREAD = 0.267


def material(name, color, roughness=0.78, metallic=0.0):
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


def sphere(name, location, radius, surface, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius,
                                          location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    return obj


def join_as(name, parts):
    """Join `parts` into one object called `name`, keeping every material slot.

    Blender's join() carries only the ACTIVE object's modifier stack, so the bevels have to be
    applied first or every part but one loses its rounding. Unlike the shop's merge, this joins
    across materials on purpose: a leg is one node wearing trousers and a shoe, and glTF is happy
    to give a single mesh two primitives."""
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


def build_figure(index, top, legs, skin, hair):
    """One colourway: a body and four limbs, five nodes named for the runtime to find."""
    # Underscores, not spaces. three.js sanitises node names as it loads a glb -- whitespace
    # becomes "_" -- so a part named "leg left" here arrives in the scene as "leg_left" and every
    # lookup by the authored name quietly finds nothing. Naming them the sanitised way up front
    # means the name in the file is the name at runtime.
    tag = f"pedestrian_{index}"

    body = join_as(f"{tag}_body", [
        cube(f"{tag}_hips", (0.0, 0.0, (HIP_Z + WAIST_Z) / 2),
             (0.19, 0.115, (WAIST_Z - HIP_Z) / 2), legs, 0.03),
        cube(f"{tag}_torso", (0.0, 0.0, (WAIST_Z + CHEST_TOP) / 2),
             (0.205, 0.115, (CHEST_TOP - WAIST_Z) / 2), top, 0.038),
        cube(f"{tag}_shoulders", (0.0, 0.0, CHEST_TOP + 0.045),
             (0.222, 0.10, 0.045), top, 0.035),
        cube(f"{tag}_neck", (0.0, 0.0, CHEST_TOP + 0.115), (0.055, 0.055, 0.030), skin),
        sphere(f"{tag}_head", (0.0, 0.0, HEAD_Z), HEAD_RADIUS, skin),
        # Cut wider than HEAD_RADIUS so the skull cannot push through the sides of its own hair.
        cube(f"{tag}_hair", (0.0, -0.016, HEAD_Z + 0.070), (0.121, 0.121, 0.060), hair, 0.048),
    ])
    # join() hands the joined object the FIRST part's origin -- here the hips, a metre up. The
    # body wants its origin on the ground so a route can position it by the pavement it walks on,
    # and that has to be a pivot move: assigning location directly would drop the whole figure by
    # the height of its own hips.
    set_pivot(body, (0.0, 0.0, 0.0))

    for side, dx in (("left", -LEG_SPREAD), ("right", LEG_SPREAD)):
        leg = join_as(f"{tag}_leg_{side}", [
            cube(f"{tag}_leg", (dx, 0.0, HIP_Z / 2), (0.075, 0.085, HIP_Z / 2), legs, 0.03),
            cube(f"{tag}_shoe", (dx, 0.045, 0.030), (0.075, 0.13, 0.030), hair, 0.02),
        ])
        set_pivot(leg, (dx, 0.0, HIP_Z))

    for side, dx in (("left", -ARM_SPREAD), ("right", ARM_SPREAD)):
        arm = join_as(f"{tag}_arm_{side}", [
            cube(f"{tag}_upper_arm", (dx, 0.0, SHOULDER_Z - 0.165),
                 (0.055, 0.062, 0.165), top, 0.03),
            cube(f"{tag}_forearm", (dx, 0.0, SHOULDER_Z - 0.4825),
                 (0.050, 0.056, 0.1525), skin, 0.028),
        ])
        set_pivot(arm, (dx, 0.0, SHOULDER_Z))


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    # The terrace patrons' palette, so a walker and someone sitting outside the cafe read as
    # people from the same city. Muted for the same reason: saturated shirts at this size become
    # the brightest thing on a pavement and pull the eye off the buildings.
    tops = [material("Pedestrian slate", (0.085, 0.135, 0.245)),
            material("Pedestrian rust", (0.355, 0.115, 0.045)),
            material("Pedestrian sage", (0.155, 0.235, 0.135)),
            material("Pedestrian mustard", (0.480, 0.320, 0.055)),
            material("Pedestrian teal", (0.055, 0.205, 0.215)),
            material("Pedestrian plum", (0.225, 0.095, 0.185))]
    legs = [material("Pedestrian denim", (0.075, 0.092, 0.125), roughness=0.82),
            material("Pedestrian charcoal", (0.085, 0.085, 0.095), roughness=0.82)]
    skins = [material("Pedestrian skin deep", (0.290, 0.150, 0.082), roughness=0.80),
             material("Pedestrian skin mid", (0.480, 0.270, 0.145), roughness=0.80),
             material("Pedestrian skin light", (0.680, 0.450, 0.295), roughness=0.80)]
    hairs = [material("Pedestrian hair dark", (0.028, 0.020, 0.016), roughness=0.66),
             material("Pedestrian hair brown", (0.105, 0.055, 0.026), roughness=0.66)]

    # Paired so no two colourways share both a top and a skin tone, which is what stops a row of
    # walkers on the same pavement from reading as the same person repeated.
    for index in range(6):
        build_figure(index, tops[index], legs[index % 2], skins[index % 3], hairs[index % 2])

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
