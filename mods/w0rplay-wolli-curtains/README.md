# W0RPLAY – Wolli Full Glass Curtains 0.5.0

Full-wrap compatibility patch using the **Grey Danish Pluche** fabric in Wolli
Interior Addon 1.6, Scania S/R 2016 Smart Dash. Requires W0RPLAY **2.1.13**.
The installed Wolli archive is not modified.

## Install and use

1. Enable **W0RPLAY – Wolli Full Glass Curtains** above **Interior Addon by Wolli** in
   the ETS2 Mod Manager. Keep Wolli enabled.
2. Fit **Grey Danish Pluche – W0RPLAY** to the side-curtain slot. An already
   fitted Grey Danish Pluche accessory keeps the same unit ID and updates
   automatically. Other Wolli curtain colours are not changed.
3. Remove the old **W0RPLAY – Smart Curtain** front accessory at a service shop;
   the full-wrap model uses the existing Wolli side-curtain slot.
4. Look towards the side curtains once so their private resource is detected,
   then use **CarPlay > Kabin > Perde**. The sleeper TV uses a separate slot.

## What the animation does

The rebuilt pleated cloth keeps the grey fabric pattern. A continuous U-shaped
rail extends along both side windows and across the complete windshield, with smooth 18cm corner turns. A roller-style blind below
the Highline roof glass closes with the same control. The two
panels overlap at the centre and cover the glass edges. Glass dimensions and the
attachment transform come from the Scania cabin models. Sixteen **complete 3D
poses** gather the fabric at the rear sides or spread it around the full rail. The controller selects the whole pose, rather than wiping a
visible strip out of a fixed closed panel. This is **discrete pose animation**,
not a skeletal animation or a cloth physics simulation.

Interior and exterior models now use separate coordinate frames calibrated from
Wolli’s matching cloth vertices. The interior rail is omitted from the exterior
model to avoid unnecessary roof/body intersections. Alpha-masked sun-shadow
casting (`eut2.dif.spec.shadow.a`) follows the selected pose; hidden poses must
not cast opaque silhouettes. Actual sunlight blocking still needs a game test.

The interior model has 49,836 exported vertices and 88,720 triangles, in two material
pieces. Its signed BGRA atlas is 1,032 × 1,032 (4,260,096 bytes on the GPU).
The controller caches only two 256px cells (524,288 bytes on the CPU), reads one
cell once after signature verification, and uploads only the old/new cells when
the selected pose changes. It adds no browser processes or draw hooks.

The default pose is open without W0RPLAY. A lost host heartbeat also returns it
to open. Unsigned textures are never written. The original prototype's signed
mask remains supported for rollback/backwards compatibility.

## Table clearance revision 0.5

The lower hem is raised to cabin-root Y=-0.55m. The lower windshield cloth
follows the actual glass triangles with a 12mm inset, reduced lower folds,
and wider side corners. All sixteen poses are checked against the installed
Racing short and long table meshes. No physical table triangles intersect;
minimum physical clearance is 10.7mm. Invisible table shadow-overlay meshes
still overlap (202 pairs); the strict all-mesh validator therefore reports FAIL.
These installed table meshes are reference colliders; the fitted accessory
identity has not been proved. In-game confirmation remains required.

## Validation and limits

- Native D3D11 tests check RGB preservation, one selected pose, open/close and
  fail-open selection, unchanged signature, and unrelated textures left intact.
- Package validation checks model/material/texture paths and the exact DDS
  contract. Blender renders show open, intermediate and closed cloth.
- Four representative eye positions and 297,636 rays to actual front/side/roof glass
  samples produced zero uncovered samples, including a raised/forward seat test.
  A roof negative control confirms its glass becomes uncovered when the roof blind
  is removed from the test. Separate exterior coordinate verification also passes.
- **In-game fit and performance still require a driving test.** A separate GPU
  microbenchmark is supporting evidence, not ETS2 frame-rate validation.

## Local reproduction

Use the existing Blender 3.6 + SCS Blender Tools and Conversion Tools 2.21 under
`tools/vendor`. `tools/build-wolli-curtain-poses.py` reads the locally extracted
cabin glass geometry and locator, then creates an original wrap rail and cloth mesh. Run resconvert on its
source project, then `tools/pack-wolli-curtain-poses.py`. The fabric pattern
originates in the user's installed Wolli package; this is a separate local
compatibility build, not part of the original front-curtain package.

The reference model has no skeleton (`BoneCount: 0`). SCS's documented accessory
unit does not provide an independent curtain animation controller:
[accessory_addon_data](https://modding.scssoft.com/wiki/Documentation/Engine/Units/accessory_addon_data).
Local build reports and inspection evidence are not redistributed.
