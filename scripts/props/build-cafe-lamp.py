from pathlib import Path

import bpy


# Nested one level deeper than the flat build scripts, so the repo root is parents[2].
ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/props/cafe-lamp.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/props/cafe-lamp.glb"

# Tops out at 2.24 against the street lamp's 3.55 -- a shade under two thirds of it. That gap is
# the whole point of a second lamp: these two stand on the Coffee House's own terrace, either side
# of its door, and a pair of full-height carriageway lamps there would out-scale the shopfront they
# are meant to be lighting. This is furniture belonging to the cafe, at the height of the awning
# rather than the height of the street.
LANTERN_BOTTOM = 1.57
LANTERN_TOP = 1.99
CAP_TOP = 2.15


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


def cylinder(name, location, radius, depth, surface, vertices=14, radius2=None, bevel=True):
    """`radius2` taps primitive_cone_add, whose radius1 is the -Z ring and radius2 the +Z one.
    Lifted from build-street-lamp.py, which is the kit's other post-and-lantern prop."""
    if radius2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius2, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    if bevel:
        narrowest = radius if radius2 is None else min(radius, radius2)
        modifier = obj.modifiers.new("Soft cylinder edge", "BEVEL")
        modifier.width = min(0.035, narrowest * 0.35, depth * 0.4)
        modifier.segments = 2
    return obj


def join_metalwork(name, parts):
    """One object with one material slot, for the same reason the street lamp joins its own: each
    object is a draw call per planted lamp. Modifiers do not survive a join, so bevels bake first."""
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


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    # No paving pad, unlike the street lamp. That lamp stands on grass verges and needs a disc to
    # sit on; this one stands on the Coffee House's timber deck, where a stone pad reads as a
    # flagstone dropped on the boards. A dark metal foot is what a terrace lamp actually has.
    iron = material("Cafe lamp iron", (0.042, 0.031, 0.026), roughness=0.52, metallic=0.18)
    iron_light = material("Cafe lamp iron highlight", (0.115, 0.088, 0.070), roughness=0.46, metallic=0.24)
    # WARMER AND DIMMER THAN THE STREET LAMP, which is the other half of what makes this a cafe
    # lamp: the street's globes run 1.8 at (1.0, 0.72, 0.34), and this is 1.15 at a redder mix. A
    # terrace is lit to be sat in rather than walked through, and matching the carriageway would
    # make the one bright thing outside the shop the lamps instead of the shop.
    glow = material(
        "Cafe lamp glow",
        (1.0, 0.80, 0.52),
        roughness=0.26,
        emission=(1.0, 0.58, 0.22),
        emission_strength=1.15,
    )

    metalwork = [
        # A low foot rather than a plinth: two shallow steps, so it reads as bolted down.
        cylinder("cafe lamp foot", (0, 0, 0.03), 0.20, 0.06, iron, 14),
        cylinder("cafe lamp foot step", (0, 0, 0.10), 0.145, 0.09, iron_light, 14, bevel=False),
        cylinder("cafe lamp base collar", (0, 0, 0.175), 0.105, 0.06, iron, 12, bevel=False),
        # The post, tapering slightly. Runs into the lantern collar rather than stopping short.
        cylinder("cafe lamp post", (0, 0, 0.85), 0.062, 1.36, iron, 12, radius2=0.048),
        cylinder("cafe lamp post collar", (0, 0, 1.55), 0.088, 0.055, iron_light, 12, bevel=False),
    ]

    # The lantern: a four-sided taper, wider at the bottom, the way a carriage lantern is built.
    # Four rather than the globe's icosphere, because the reference this is drawn from is a glazed
    # box with corner posts, and a round head would read as a smaller street lamp instead.
    lantern_depth = LANTERN_TOP - LANTERN_BOTTOM
    lantern_mid = (LANTERN_TOP + LANTERN_BOTTOM) / 2
    lamp_glass = cylinder("cafe lamp glass", (0, 0, lantern_mid), 0.155, lantern_depth, glow, 4, radius2=0.112)

    metalwork.extend([
        # Cap and finial over the glass, and a thin sill under it, so the glazing is held rather
        # than floating between two gaps.
        cylinder("cafe lamp sill", (0, 0, LANTERN_BOTTOM - 0.015), 0.175, 0.05, iron, 4, bevel=False),
        cylinder("cafe lamp cap", (0, 0, (LANTERN_TOP + CAP_TOP) / 2), 0.205, CAP_TOP - LANTERN_TOP, iron,
                 4, radius2=0.028),
        cylinder("cafe lamp finial", (0, 0, CAP_TOP + 0.035), 0.028, 0.07, iron_light, 8, bevel=False),
    ])
    join_metalwork("cafe lamp post", metalwork)

    # The soft, rounded read of the whole kit comes from this pass. The glass is left faceted: four
    # flat panes are what a carriage lantern has, and smoothing them rounds it into a bulb.
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and obj is not lamp_glass:
            for polygon in obj.data.polygons:
                polygon.use_smooth = True

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_PATH),
        export_format="GLB",
        use_selection=True,
        export_materials="EXPORT",
        export_apply=True,
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH))


main()
