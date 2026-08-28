from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "artwork/3d/v3/driveway-straight.blend"
OUTPUT_PATH = ROOT / "public/assets/city/v3/driveway-straight.glb"


def material(name, color, roughness=0.84):
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
        modifier = obj.modifiers.new("Soft concrete edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def ramp(name, width, length, low_height, high_height, surface):
    half_width = width / 2
    vertices = [
        (-half_width, 0, 0),
        (half_width, 0, 0),
        (half_width, length, 0),
        (-half_width, length, 0),
        (-half_width, 0, low_height),
        (half_width, 0, low_height),
        (half_width, length, high_height),
        (-half_width, length, high_height),
    ]
    faces = [
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ]
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(surface)
    return obj


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    concrete = material("Driveway concrete", (0.54, 0.56, 0.57))
    concrete_edge = material("Driveway edge", (0.66, 0.67, 0.67))
    joint = material("Concrete expansion joints", (0.31, 0.33, 0.34))

    ramp("curb ramp", 3.4, 1.2, 0.07, 0.20, concrete)
    cube("driveway slab", (0, 5.325, 0.14), (1.7, 4.125, 0.06), concrete)
    cube("left driveway edge", (-1.64, 5.325, 0.205), (0.06, 4.125, 0.012), concrete_edge, 0.01)
    cube("right driveway edge", (1.64, 5.325, 0.205), (0.06, 4.125, 0.012), concrete_edge, 0.01)

    for y in (1.5, 3.0, 4.5, 6.0, 7.5, 9.0):
        cube("expansion joint", (0, y, 0.205), (1.58, 0.018, 0.008), joint)

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
