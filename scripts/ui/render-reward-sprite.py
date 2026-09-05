"""Bakes the sealed gift to a flat PNG for the founder card's progress bar.

The card's milestone marker is about 26px and never moves, so it does not earn a WebGL context of
its own — the page already runs one for the city and another for any open modal's preview. Rendering
the same model Blender-side gives the identical object at no runtime cost.

Three settings here are load-bearing, each learned by getting it wrong first:

- `film_transparent`, because the marker sits on the card's cream gradient.
- `view_transform = "Standard"`. The default AgX desaturates far enough that the gold and the ribbon
  come out as beige and pink, which makes judging the render pointless.
- The camera orbits; the objects never do. `rotation_euler` on an object turns it about its *own*
  origin, so anything not centred spins in place instead of orbiting the assembly — that quietly
  hid half the bow and every off-centre detail before it was spotted.
"""

from math import cos, radians, sin
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "artwork/3d/v3/ui/reward-gift-sealed.blend"
OUTPUT_PATH = ROOT / "public/assets/ui/reward-gift-marker.png"

# The three-quarter angle the city's own buildings are read at, and the yaw the reward models were
# composed against.
YAW = 34
# Distance and height set the pitch: atan(3.1 / 7.0) is about 24 degrees, looking slightly down.
DISTANCE = 7.0
HEIGHT = 3.1
# Just wider than the gift's ~1.9 unit silhouette. Framed loosely the gift filled two-thirds of the
# PNG, which at a 30px marker left about 20px of actual present; this leaves only enough margin to
# keep the bow off the edge.
FRAME = 2.15

# The gift is bottom-heavy — a bulky box under a thin bow — so aiming at its geometric centre still
# lands the *opaque* pixels low in the square. This lifts them back to the middle, which is what lets
# the marker be positioned by its box rather than by eye.
SHIFT_Y = -0.08
RESOLUTION = 256


def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE_PATH))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = RESOLUTION
    scene.render.resolution_y = RESOLUTION

    # The build scripts start from an empty file, so the saved .blend carries no world and the
    # scene has literally no ambient — the faces turned away from both lights rendered black.
    # `film_transparent` hides the world from camera rays but keeps it lighting the scene, so this
    # fills the shadow side without putting a background behind the gift.
    scene.world = bpy.data.worlds.new("Sprite ambient")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes["Background"]
    background.inputs[0].default_value = (1.0, 0.97, 0.90, 1.0)
    background.inputs[1].default_value = 0.30

    bpy.ops.object.camera_add(
        location=(DISTANCE * sin(radians(YAW)), -DISTANCE * cos(radians(YAW)), HEIGHT),
        rotation=(radians(72), 0, radians(YAW)),
    )
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = FRAME
    camera.data.shift_y = SHIFT_Y
    scene.camera = camera

    # A key from the front left and a soft fill from the right, matching how the reward models are
    # lit in the app: strong top-left directional, weaker second light opposite.
    bpy.ops.object.light_add(type="SUN", location=(-3, -4, 6))
    key = bpy.context.object
    key.data.energy = 2.1
    key.rotation_euler = (radians(48), 0, radians(-38))

    bpy.ops.object.light_add(type="AREA", location=(4, -3, 3))
    fill = bpy.context.object
    fill.data.energy = 22
    fill.data.size = 6

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(OUTPUT_PATH)
    bpy.ops.render.render(write_still=True)


main()
