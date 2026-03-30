"""
Advanced Image Processing Suite DSL Example

Create synchronized image variants (thumbnail, web, HD) while capturing rich metadata.

Workflow:
1. **Image Input** – Load a hero image for processing
2. **Normalization** – Fit to a consistent 2048px bounding box for predictable edits
3. **Metadata Analysis** – Capture format, mode, dimensions, and orientation
4. **Parallel Branches** – Produce thumbnail, web, and HD variants with targeted adjustments
5. **Synchronized Merge** – Combine results with `sync_mode="zip_all"` so all branches finish together
6. **Reporting** – Generate metadata table for downstream analytics

ASCII graph outline:

          [ImageInput]
                |
              [Fit]
          _____/|\_____
         /      |      \
    [Thumb]  [Web]   [HD]
       |        |      |
  [AutoC]   [Color]  [Unsharp]
       |        |      |
   [Sharp]   [Sharp] [AutoC]
         \      |      /
          \  (zip_all) /
             [Combine]
            ____|____
           /    |    \
      [Dict] [Images] [Metadata]
                 |
      (thumbnail / web / hd outputs)

Demonstrates:
- Pillow-based image enhancement nodes
- Multi-branch processing synchronized with `zip_all`
- Structured outputs (image bundle + dataframe metadata)
- Practical asset pipeline pattern for production workflows
"""

from nodetool.chat.workspace_manager import WorkspaceManager
from nodetool.dsl.graph import create_graph, run_graph
from nodetool.providers.base import ProcessingContext
from nodetool.workflows.processing_context import AssetOutputMode
from nodetool.dsl.nodetool.input import ImageInput
from nodetool.dsl.nodetool.image import Fit, GetMetadata
from nodetool.dsl.lib.pillow.enhance import AutoContrast, Color, Sharpness, UnsharpMask
from nodetool.dsl.nodetool.text import FormatText
from nodetool.dsl.nodetool.dictionary import MakeDictionary, Combine
from nodetool.dsl.nodetool.data import JSONToDataframe
from nodetool.dsl.nodetool.output import (
    Output,
)
from nodetool.metadata.types import ImageRef


# --- Input & Normalization -------------------------------------------------
# Hero image that will be processed into multiple formats
source_image = ImageInput(
    name="hero_image",
    description="High-resolution source image to optimize across formats",
    value=ImageRef(
        uri="https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Yosemite_national_park_el_capitan.jpg/960px-Yosemite_national_park_el_capitan.jpg",
    ),
)

# Normalize the asset to a consistent bounding box so all branches share the
# same baseline dimensions before specialized transforms are applied.
normalized_image = Fit(
    image=source_image.output,
    width=640,
    height=480,
)

# Extract technical metadata (format, mode, dimensions) from the normalized image.
image_metadata = GetMetadata(image=normalized_image.output)

# --- Metadata Enrichment ----------------------------------------------------
# Single formatter handles orientation logic inline, avoiding dedicated boolean nodes.
orientation_label = FormatText(
    template="""{% if width > height %}Landscape{% elif width == height %}Square{% else %}Portrait{% endif %}""",
    width=image_metadata.out.width,
    height=image_metadata.out.height,
)

# Friendly dimension label (e.g., "2048 x 1536 px") for downstream summaries.
normalized_dimensions = FormatText(
    template="{{ width }} x {{ height }} px",
    width=image_metadata.out.width,
    height=image_metadata.out.height,
)

# --- Parallel Processing Branches ------------------------------------------
# Branch 1: Compact square thumbnail for previews or social cards.
thumbnail_base = Fit(
    image=normalized_image.output,
    width=320,
    height=320,
)
thumbnail_contrast = AutoContrast(
    image=thumbnail_base.output,
    cutoff=4,
)
thumbnail_ready = Sharpness(
    image=thumbnail_contrast.output,
    factor=1.3,
)

# Branch 2: Web-optimized variant with slight color boost for vibrancy.
web_base = Fit(
    image=normalized_image.output,
    width=1280,
    height=720,
)
web_color = Color(
    image=web_base.output,
    factor=1.1,
)
web_ready = Sharpness(
    image=web_color.output,
    factor=1.15,
)

# Branch 3: High-detail HD master with sharpening tuned for larger displays.
hd_base = Fit(
    image=normalized_image.output,
    width=2048,
    height=1536,
)
hd_unsharp = UnsharpMask(
    image=hd_base.output,
    radius=2,
    percent=180,
    threshold=3,
)
hd_ready = AutoContrast(
    image=hd_unsharp.output,
    cutoff=2,
)

# --- Metadata Reporting -----------------------------------------------------
# Compose JSON string so we can materialize a DataFrame output.
metadata_json = FormatText(
    template="""[
  {
    "format": "{{ image_format }}",
    "mode": "{{ mode }}",
    "width": {{ width }},
    "height": {{ height }},
    "orientation": "{{ orientation }}",
    "normalized_size": "{{ normalized_size }}"
  }
]""",
    image_format=image_metadata.out.format,
    mode=image_metadata.out.mode,
    width=image_metadata.out.width,
    height=image_metadata.out.height,
    orientation=orientation_label.output,
    normalized_size=normalized_dimensions.output,
)

# Structured metadata table for downstream reporting or storage.
metadata_table = JSONToDataframe(text=metadata_json.output)

# Human-readable summary describing the generated variants.
summary_text = FormatText(
    template="""# Image Variant Summary

- Orientation: {{ orientation }}
- Normalized dimensions: {{ normalized_size }}
- Variants generated: Thumbnail (320px square), Web (1280x720), HD (2048x1536)
- Notes: All branches share baseline normalization and enhanced contrast for consistent branding.
""",
    orientation=orientation_label.output,
    normalized_size=normalized_dimensions.output,
)

# --- Synchronized Merge (sync_mode="zip_all") -------------------------------
# Gather image variants first so the dictionary waits for all three branches.
image_variants = MakeDictionary(
    thumbnail=thumbnail_ready.output,
    web=web_ready.output,
    hd=hd_ready.output,
    sync_mode="zip_all",
)

# Bundle metadata and narrative context.
metadata_bundle = MakeDictionary(
    orientation=orientation_label.output,
    normalized_size=normalized_dimensions.output,
    summary=summary_text.output,
    metadata_table=metadata_table.output,
    metadata_json=metadata_json.output,
)

# Combine everything into a single package; sync_mode="zip_all" ensures the
# result is emitted only after both dictionaries have been populated.
image_package = Combine(
    dict_a=image_variants.output,
    dict_b=metadata_bundle.output,
    sync_mode="zip_all",
)

# --- Outputs ----------------------------------------------------------------
package_output = Output(
    name="image_processing_bundle",
    description="Aggregated image variants plus metadata (synchronized via zip_all).",
    value=image_package.output,
)

metadata_output = Output(
    name="image_metadata",
    description="Tabular metadata captured from the normalized image.",
    value=metadata_table.output,
)

thumbnail_output = Output(
    name="thumbnail_variant",
    description="320px square thumbnail optimized for previews.",
    value=thumbnail_ready.output,
)

web_output = Output(
    name="web_variant",
    description="1280x720 web-friendly variant with boosted vibrancy.",
    value=web_ready.output,
)

hd_output = Output(
    name="hd_variant",
    description="2048x1536 high-detail master asset.",
    value=hd_ready.output,
)

# Build the workflow graph including all outputs for inspection.
graph = create_graph(
    package_output,
    metadata_output,
    thumbnail_output,
    web_output,
    hd_output,
)


if __name__ == "__main__":
    workspace_dir = WorkspaceManager().get_current_directory()
    context = ProcessingContext(
        workspace_dir=workspace_dir,
        asset_output_mode=AssetOutputMode.WORKSPACE,
    )
    result = run_graph(graph, context=context) 
    print("✅ Advanced image processing suite complete!")
    print("Bundle keys:", list(result["image_processing_bundle"].keys()))
    print("Workspace dir: ", context.workspace_dir)
