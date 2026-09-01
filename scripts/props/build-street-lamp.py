from pathlib import Path

import bpy


# Nested one level deeper than the flat build scripts, so the repo root is parents[2].
ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/props/street-lamp.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/props/street-lamp.glb"

# Tops out at ~3.55, below the canopy tree (4.31) and the palm (5.34), so a lamp reads as street
# furniture standing among the planting rather than competing with it.
SHAFT_TOP = 2.55
GLOBE_CENTRE_Z = 3.14
GLOBE_RADIUS = 0.34


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
    `bevel=False` is for the thin collars, where a 0.03 fillet is invisible at city zoom but
    triples the piece's triangle count."""
    if radius2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius2, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new("Soft cylinder edge", "BEVEL")
        # Scale off the narrow end of a cone: sizing from the wide end blunts the tip, which on
        # the shaft would eat the very surface the collars attach to.
        narrowest = radius if radius2 is None else min(radius, radius2)
        modifier.width = min(0.045, narrowest * 0.35, depth * 0.4)
        modifier.segments = 2
    return obj


def join_metalwork(name, parts):
    """Collapses the ironwork into a single object with two material slots. Each object costs a
    draw call per planted lamp and twelve are planted, the same reasoning the palm crown uses.
    Modifiers do not survive a join, so every bevel has to be baked first."""
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

    # A stone pad, not the trees' mulch ring: a lamp is bolted down, not planted, and brown soil
    # under it reads as spilled mud on the verge. This is the sidewalk's paving tone, matching the
    # sign gantry's pillar pads — the kit's other manufactured post standing on grass.
    paving = material("Lamp paving pad", (0.48, 0.51, 0.53), roughness=0.85)
    # Two metal tones, not one: a single near-black collapses into a silhouette blob at city zoom,
    # and the stepped base is the whole character of the reference lamp.
    iron = material("Lamp charcoal iron", (0.030, 0.038, 0.045), roughness=0.55, metallic=0.15)
    iron_light = material("Lamp iron highlight", (0.105, 0.125, 0.140), roughness=0.5, metallic=0.2)
    # The kit's glass glows at 0.65; its actual light sources (the garage work light, the monitor
    # screens) run 1.6-2.4. A lamp belongs in the second band. Strengths above 1 survive the glTF
    # export via KHR_materials_emissive_strength.
    globe = material(
        "Lamp globe glow",
        (1.0, 0.88, 0.62),
        roughness=0.28,
        emission=(1.0, 0.72, 0.34),
        emission_strength=1.8,
    )

    # Nothing on the avenues casts a shadow — they sit far outside the light's default shadow
    # camera — so this disc is the lamp's only ground-contact cue, as on the trees and the gantry.
    cylinder("lamp paving pad", (0, 0, 0.05), 0.36, 0.10, paving, 16)

    metalwork = [
        # Stepped flared base.
        cylinder("lamp base tier", (0, 0, 0.16), 0.30, 0.20, iron, 14),
        cylinder("lamp base step", (0, 0, 0.32), 0.24, 0.16, iron_light, 14, bevel=False),
        cylinder("lamp base collar", (0, 0, 0.45), 0.175, 0.14, iron, 14, bevel=False),
        # Runs the whole way to the cup: at depth 2.05 the top landed at 2.545 and left collar B
        # and everything above it floating 0.04 clear of the post.
        cylinder("lamp shaft", (0, 0, 1.575), 0.095, 2.16, iron, 12, radius2=0.075),
        # Twin collars under the globe, echoing the kit's plinth/collar banding.
        cylinder("lamp shaft collar", (0, 0, 2.50), 0.135, 0.08, iron_light, 12, bevel=False),
        cylinder("lamp cup collar", (0, 0, 2.62), 0.115, 0.07, iron, 12, bevel=False),
        # Narrow at the bottom, flaring up to cradle the globe. Reversed, radius1 being the lower
        # ring makes this a downward skirt with an unsupported flange hanging over the collar.
        cylinder("lamp globe cup", (0, 0, 2.74), 0.125, 0.18, iron_light, 14, radius2=0.19),
    ]

    # Subdivision 3, not the 2 the foliage uses: faceting reads as organic on a shrub but as
    # cheap on a glass globe, and this one is ~33px across at full zoom.
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=GLOBE_RADIUS, location=(0, 0, GLOBE_CENTRE_Z))
    lamp_globe = bpy.context.object
    lamp_globe.name = "lamp globe"
    lamp_globe.data.materials.append(globe)

    metalwork.append(cylinder("lamp finial", (0, 0, 3.50), 0.075, 0.10, iron, 12, bevel=False))
    join_metalwork("lamp post", metalwork)

    # The soft, rounded read of the whole kit comes from this pass.
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
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
