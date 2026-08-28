from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "artwork/3d/v3/road-straight.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/road-straight.glb"


def material(name, color, roughness=0.65):
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
        modifier = obj.modifiers.new("Soft corners", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    asphalt = material("Road asphalt", (0.055, 0.085, 0.10))
    marking = material("Road paint", (0.96, 0.87, 0.60))
    cube("asphalt", (0, 0, 0.03), (25, 2.15, 0.03), asphalt)
    for x in range(-23, 24, 3):
        cube("center dash", (x, 0, 0.08), (0.55, 0.08, 0.025), marking, 0.01)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT_PATH), export_format="GLB", use_selection=True, export_materials="EXPORT", export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH))


main()
