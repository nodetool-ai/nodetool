# BLACKSITE material prompts

Generated with the built-in imagegen tool. The normal map uses `tread-plate.png`
as its edit reference. These PNGs are embedded in the prepared GLB models.

Each prompt begins with this shared style string:

> Industrial hard-surface 3D, charcoal steel, cyan guide lights, amber machinery, sharp silhouettes, and low-key lighting.

## Tread plate

Asset type: physically based 3D game base-color texture, not a scene illustration. Generate a square seamless tileable texture of industrial gunmetal steel floor plates, closely photographed orthogonally straight down. Dark-medium gray steel, fine raised diamond tread on large rectangular plates, narrow seams, subtle rubbed silver edges, tiny bolts in corners, realistic pitting, scattered scratches, faint oxidation and oil staining, believable material scale. High-end photogrammetric AAA environment material. Fill the entire image edge to edge. Flat neutral diffuse illumination suitable for a PBR albedo map; no perspective, no cast shadows, no light sources, no text, no border, no labels. Moderate tonal variation, detailed readable texture, not nearly black.

## Concrete

Asset type: physically based 3D game base-color texture. Square seamless tileable texture of weathered reinforced concrete in a decommissioned industrial research facility. Orthographic flat surface photograph, medium cool gray exposed concrete, subtle vertical casting marks, aggregate grains, hairline fractures, water stains and soot, worn small surface chips. Photoreal physically believable architectural material, fine surface variation at all scales. Flat diffuse neutral lighting, no perspective, no objects, no cast shadows, no text, no border, fill edge to edge. High-end AAA environment texture with moderately bright midtones, not black.

## Painted steel

Asset type: physically based 3D game base-color texture. Square seamless tileable texture of worn painted steel machinery panels. Desaturated pale blue-gray enamel over machined steel, scratched corners, fine scuffs, scattered chipped paint revealing warm oxidized steel, subtle grime and oily smudges, restrained weathering with large intact paint regions. Close orthographic surface photograph. Industrial high-end photogrammetric AAA material. No perspective, no objects, no text, no border, no cast shadows, flat neutral diffuse light, edge-to-edge texture. Medium-light albedo for clear visibility under dramatic game lighting.

## Tread normal map

Edit this texture into a technical tangent-space NORMAL MAP for the exact same steel tread-plate surface. Preserve every seam, bolt and diamond tread location exactly. Standard OpenGL normal map convention, predominantly RGB (128,128,255), surface slopes encoded red and green with positive Z blue. Raised diamond ridges and bolt heads, recessed panel seams, subtle pitting. No albedo color, no photographic illumination, no text. Output only the square normal-map texture aligned pixel-for-pixel to the input.
