from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "artwork/3d/v3/map-base.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/map-base.glb"


def material(name, color):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = 0.82
    return value


def cube(name, location, scale, surface):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    return obj


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    grey = material("Plain grey base", (0.42, 0.44, 0.46))
    cube("map base", (0, 0, -0.20), (25, 15, 0.20), grey)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT_PATH), export_format="GLB", use_selection=True, export_materials="EXPORT", export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH))


main()
