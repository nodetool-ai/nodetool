import pytest
from nodetool.dsl.graph import graph_result
from nodetool.dsl.lib.image.pillow.enhance import (
    AutoContrast,
    Brightness,
    Contrast,
    EdgeEnhance,
    Sharpen,
    UnsharpMask,
)
from nodetool.dsl.lib.image.pillow.draw import (
    Background,
    GaussianNoise,
    RenderText,
)
from nodetool.dsl.nodetool.image import ColorRef
from nodetool.dsl.nodetool.output import ImageOutput

# Create a background image
background = ImageOutput(
    name="background",
    value=Background(
        width=512,
        height=512,
        color=ColorRef(type="color", value="#E0E0E0"),
    ),
)

# Add text to an image
text_on_image = ImageOutput(
    name="text_on_image",
    value=RenderText(
        image=Background(
            width=512, height=512, color=ColorRef(type="color", value="#FFFFFF")
        ),
        text="Hello, World!",
        x=256,
        y=256,
        size=48,
        color=ColorRef(type="color", value="#000000"),
        align=RenderText.TextAlignment("center"),
        font=RenderText.TextFont("Verdana.ttf"),
    ),
)

# Image enhancement chain
enhanced_image = ImageOutput(
    name="enhanced_image",
    value=Sharpen(
        image=Contrast(
            image=Brightness(
                image=Background(
                    width=512, height=512, color=ColorRef(type="color", value="#FFFFFF")
                ),
                factor=1.2,
            ),
            factor=1.3,
        )
    ),
)

# Noise and edge enhancement
noise_with_edges = ImageOutput(
    name="noise_with_edges",
    value=EdgeEnhance(image=GaussianNoise(width=512, height=512, mean=0.5, stddev=0.1)),
)

# Advanced image processing
advanced_image = ImageOutput(
    name="advanced_image",
    value=UnsharpMask(
        image=AutoContrast(
            image=Background(
                width=512, height=512, color=ColorRef(type="color", value="#CCCCCC")
            ),
            cutoff=5,
        ),
        radius=2,
        percent=150,
        threshold=3,
    ),
)


@pytest.mark.asyncio
async def test_background():
    result = await graph_result(background)
    assert result is not None


# TODO: fails on CI
# @pytest.mark.asyncio
# async def test_text_on_image():
#     result = await graph_result(text_on_image)
#     assert result is not None


@pytest.mark.asyncio
async def test_enhanced_image():
    result = await graph_result(enhanced_image)
    assert result is not None


@pytest.mark.asyncio
async def test_noise_with_edges():
    result = await graph_result(noise_with_edges)
    assert result is not None


@pytest.mark.asyncio
async def test_advanced_image():
    result = await graph_result(advanced_image)
    assert result is not None
