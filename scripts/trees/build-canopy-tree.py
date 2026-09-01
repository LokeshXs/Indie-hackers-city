from pathlib import Path

import bpy


# Nested one level deeper than the other build scripts, so the repo root is parents[2].
ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/trees/canopy-tree.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/trees/canopy-tree.glb"

TRUNK_HEIGHT = 1.90
# Tops out at 4.31, deliberately shorter than every level-1 building (4.28 / 5.27 / 5.71) so the
# avenues read buildings-first. The widest sphere also has to clear the 5.9-wide verge at scale 1.1.
CANOPY_CENTRE_Z = 3.05


def material(name, color, roughness=0.9):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    return value


def cylinder(name, location, radius, depth, surface, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    bevel = obj.modifiers.new("Soft cylinder edge", "BEVEL")
    bevel.width = min(0.045, radius * 0.5, depth * 0.4)
    bevel.segments = 2
    return obj


def foliage(name, location, radius, surface):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(surface)
    return obj


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    soil = material("Tree soil ring", (0.115, 0.088, 0.052))
    bark = material("Tree bark", (0.235, 0.140, 0.072))
    # Shares the palm's canopy palette: sits in the grass's yellow-green hue family and runs
    # darker than the verge, rather than the kit's teal-leaning shrub greens which go mint at
    # tree scale. See scripts/trees/build-palm-tree.py for the full reasoning.
    leaf_dark = material("Tree canopy deep", (0.025, 0.125, 0.032), roughness=0.72)
    leaf_mid = material("Tree canopy mid", (0.058, 0.245, 0.055), roughness=0.72)
    leaf_light = material("Tree canopy light", (0.125, 0.375, 0.095), roughness=0.72)

    # The avenue verges are lit from overhead and these trees are far outside the light's shadow
    # frustum, so a soil ring is the only thing that reads as ground contact.
    cylinder("canopy tree soil ring", (0, 0, 0.05), 0.78, 0.10, soil, 20)
    cylinder("canopy tree root flare", (0, 0, 0.20), 0.44, 0.28, bark, 16)
    cylinder("canopy tree trunk", (0, 0, TRUNK_HEIGHT / 2 + 0.14), 0.26, TRUNK_HEIGHT, bark, 14)

    # Three overlapping spheres in dark/mid/light: the same cluster every planter, shrub and hedge
    # in the kit is built from, which is what makes this read as part of the same set.
    for dx, dy, dz, radius, surface in (
        (0.00, 0.00, 0.05, 1.16, leaf_mid),
        (-0.62, -0.52, 0.34, 0.92, leaf_light),
        (0.66, 0.48, -0.30, 0.98, leaf_dark),
    ):
        foliage("canopy tree foliage", (dx, dy, CANOPY_CENTRE_Z + dz), radius, surface)

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
