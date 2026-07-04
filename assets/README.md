# Sprite overrides

Drop PNG files into this folder to replace the procedural art. The game
probes `assets/<name>.png` for every sprite at boot; any file found is used
instead of the code-drawn version. Hitboxes are independent of art, so
overrides never change gameplay.

Images are drawn into the sprite's registered box (width × height in logical
pixels, listed below) with the anchor at the draw position. Animals face
**right** (+x); the game mirrors them when walking left.

## Animals

For each species `deer`, `elk`, `moose` and each role `buck`, `doe`:

| Name | Notes |
|---|---|
| `<species>_<role>_walk_0` … `walk_3` | 4-frame walk cycle |
| `<species>_<role>_run_0`, `run_1` | 2-frame gallop |
| `<species>_<role>_graze` | head-down grazing pose |

Anchor: bottom-center (feet on the ground line).

Box sizes (w × h): deer 176×181, elk 193×193, moose 202×190.

Example filenames: `deer_buck_walk_0.png`, `moose_doe_graze.png`.

## Other sprites

| Name | Box | Anchor |
|---|---|---|
| `duck_0`, `duck_1` | 64×48 | center (wing up / wing down) |
| `crosshair` | 48×48 | center |
| `shell` | 12×24 | center |
| `muzzle_0`, `muzzle_1` | 56×56 | center |

Partial overrides are fine — override one sprite or all of them.
