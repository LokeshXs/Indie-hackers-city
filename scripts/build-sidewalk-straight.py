from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "artwork/3d/v3/sidewalk-straight.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/sidewalk-straight.glb"


def material(name, color, roughness=0.82):
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
        modifier = obj.modifiers.new("Soft edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    paving = material("Cool grey paving", (0.48, 0.51, 0.53))
    border = material("Paving border", (0.61, 0.63, 0.64))
    joint = material("Paving joints", (0.30, 0.33, 0.35))

    cube("sidewalk slab", (0, 0, 0.09), (25, 1, 0.09), paving)
    cube("roadside border", (0, -0.94, 0.19), (25, 0.06, 0.02), border, 0.015)
    cube("outer border", (0, 0.94, 0.19), (25, 0.06, 0.02), border, 0.015)
    cube("center paving joint", (0, 0, 0.185), (25, 0.018, 0.008), joint)

    for x in range(-24, 25, 2):
        cube("lower row joint", (x, -0.5, 0.185), (0.018, 0.47, 0.008), joint)
    for x in range(-23, 25, 2):
        cube("upper row joint", (x, 0.5, 0.185), (0.018, 0.47, 0.008), joint)

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
