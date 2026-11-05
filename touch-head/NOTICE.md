# Notice

SPDX-License-Identifier: CERN-OHL-S-2.0

`stl/TouchHead.stl` and `stl/TouchHeadHat.stl` contain modified geometry from the
Tiny Engineer hardware design (`3d_models/parts/sg90/stl/Head.stl` and `Hat.stl`):

    Copyright (c) 2026 Krzysztof Jamroz
    Source Location: https://github.com/jamro/tiny-engineer/tree/aefc852a894174604a1e350bf9bc04c04f28ec80/3d_models

Modifications (2026-11-05):

- `Head`: the OLED box at the front is cut off (X >= 11.6 mm). It is replaced by a
  new box for a Waveshare 2inch Capacitive Touch LCD: a groove, stops behind the
  glass, lid screw bosses and a cable notch. The servo frame is unchanged.
- `Hat`: shortened to its narrow part (X < 11.5 mm installed, |Y| < 16.45 mm).
- `TouchHeadLid` is new.

The source of these modifications is `generate.py` in this folder. It downloads
the original files from the commit above and checks their SHA-256. The whole
folder is distributed under CERN-OHL-S-2.0. The licence text is in `LICENSE`.

Source Location for this modified design: this folder, in the repository it is
published in. If you make or give away a product based on it, show both Source
Locations (upstream and this folder), for example in the assembly notes.

The design is provided "as is", without any warranty (section 6 of the licence).
The Tiny Engineer name and logo are not covered by the licence.
