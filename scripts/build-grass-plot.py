from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "artwork/3d/v3/grass-plot.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/grass-plot.glb"


def material(name, color, roughness=0.9):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    return value


def cube(name, location, scale, surface, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new("Soft plot edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    soil = material("Plot soil edge", (0.15, 0.12, 0.07))
    grass = material("Fresh grass", (0.10, 0.36, 0.08))
    grass_light = material("Mown grass highlight", (0.17, 0.45, 0.11))

    cube("plot soil", (0, 0, 0.035), (5.7, 5.15, 0.035), soil, 0.06)
    cube("grass surface", (0, 0, 0.075), (5.62, 5.07, 0.025), grass, 0.05)

    for y in (-3.75, -1.25, 1.25, 3.75):
        cube("subtle mowing stripe", (0, y, 0.103), (5.50, 0.62, 0.004), grass_light)

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
