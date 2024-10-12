import enum
import os
import tempfile
import ffmpeg
import time
import re

from typing import Any
import PIL.ImageFilter
import PIL.ImageOps
import PIL.Image
import PIL.ImageEnhance
import numpy as np
from pydantic import Field
from nodetool.metadata.types import AudioRef, FolderRef, TextRef
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import VideoRef
import tempfile


class SaveVideo(BaseNode):
    """
    Save a video to a file.
    video, save, file, output

    Use cases:
    1. Export processed video to a specific folder
    2. Save video with a custom name
    3. Create a copy of a video in a different location
    """

    value: VideoRef = Field(default=VideoRef(), description="The video to save.")
    folder: FolderRef = Field(
        default=FolderRef(), description="Name of the output folder."
    )
    name: str = Field(default="video", description="Name of the output video.")

    async def process(self, context: ProcessingContext) -> VideoRef:
        video = await context.asset_to_io(self.value)
        return await context.video_from_io(
            buffer=video,
            name=self.name,
            parent_id=self.folder.asset_id if self.folder.is_set() else None,
        )


class ExtractFrames(BaseNode):
    """
    Extract frames from a video file.
    video, frames, extract, sequence

    Use cases:
    1. Generate image sequences for further processing
    2. Extract specific frame ranges from a video
    3. Create thumbnails or previews from video content
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to adjust the brightness for."
    )
    start: int = Field(default=0, description="The frame to start extracting from.")
    end: int = Field(default=-1, description="The frame to stop extracting from.")

    async def process(self, context: ProcessingContext) -> list[ImageRef]:
        import imageio.v3 as iio

        video_file = await context.asset_to_io(self.video)
        images = []
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as temp:
            temp.write(video_file.read())
            temp.flush()
            for i, frame in enumerate(iio.imiter(temp.name, plugin="pyav")):
                if i > self.start and (self.end == -1 or i < self.end):
                    img = PIL.Image.fromarray(frame)
                    img_ref = await context.image_from_pil(img)
                    images.append(img_ref)
        return images

    def result_for_client(self, result: dict[str, Any]) -> dict[str, Any]:
        return {}


class Fps(BaseNode):
    """
    Get the frames per second (FPS) of a video file.
    video, analysis, frames, fps

    Use cases:
    1. Analyze video properties for quality assessment
    2. Determine appropriate playback speed for video editing
    3. Ensure compatibility with target display systems
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to adjust the brightness for."
    )

    async def process(self, context: ProcessingContext) -> float:
        import imageio.v3 as iio

        video_file = await context.asset_to_io(self.video)
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as temp:
            temp.write(video_file.read())
            temp.flush()
            return iio.immeta(temp.name, plugin="pyav")["fps"]


class CreateVideo(BaseNode):
    """
    Combine a sequence of frames into a single video file.
    video, frames, combine, sequence

    Use cases:
    1. Create time-lapse videos from image sequences
    2. Compile processed frames back into a video
    3. Generate animations from individual images
    """

    frames: list[ImageRef] = Field(
        default_factory=list, description="The frames to combine into a video."
    )
    fps: float = Field(default=30, description="The FPS of the output video.")

    async def process(self, context: ProcessingContext) -> VideoRef:
        if not self.frames:
            raise ValueError("No frames provided to create video.")

        with tempfile.TemporaryDirectory() as temp_dir:
            # Save all frames as images in the temporary directory
            frame_paths = []
            for i, img_ref in enumerate(self.frames):
                img = await context.image_to_pil(img_ref)
                frame_path = os.path.join(temp_dir, f"frame_{i:05d}.png")
                img.save(frame_path)
                frame_paths.append(frame_path)

            # Create a temporary file for the output video
            with tempfile.NamedTemporaryFile(suffix=".mp4") as temp_output:
                try:
                    # Use FFmpeg to create video from frames
                    (
                        ffmpeg.input(
                            os.path.join(temp_dir, "frame_%05d.png"), framerate=self.fps
                        )
                        .output(temp_output.name, vcodec="libx264", pix_fmt="yuv420p")
                        .overwrite_output()
                        .run(capture_stdout=True, capture_stderr=True)
                    )

                    # Read the created video and return as VideoRef
                    with open(temp_output.name, "rb") as f:
                        return await context.video_from_io(f)

                except ffmpeg.Error as e:
                    print(f"FFmpeg stdout:\n{e.stdout.decode('utf8')}")
                    print(f"FFmpeg stderr:\n{e.stderr.decode('utf8')}")
                    raise RuntimeError(
                        f"Error creating video: {e.stderr.decode('utf8')}"
                    )


class Concat(BaseNode):
    """
    Concatenate multiple video files into a single video.
    video, concat, merge, combine

    Use cases:
    1. Merge multiple video clips into a single continuous video
    2. Create compilations from various video sources
    3. Combine processed video segments back into a full video
    """

    video_a: VideoRef = Field(
        default=VideoRef(), description="The first video to concatenate."
    )
    video_b: VideoRef = Field(
        default=VideoRef(), description="The second video to concatenate."
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.video_a.is_empty() or self.video_b.is_empty():
            raise ValueError("Both videos must be connected.")

        video_a = await context.asset_to_io(self.video_a)
        video_b = await context.asset_to_io(self.video_b)

        with tempfile.NamedTemporaryFile(suffix=".mp4") as temp_a:
            temp_a.write(video_a.read())
            with tempfile.NamedTemporaryFile(suffix=".mp4") as temp_b:
                temp_b.write(video_b.read())
                # Create a temporary file for the output
                with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                    ffmpeg.concat(
                        ffmpeg.input(temp_a.name), ffmpeg.input(temp_b.name)
                    ).output(output_temp.name).overwrite_output().run(quiet=False)

                    # Read the concatenated video and create a VideoRef
                    with open(output_temp.name, "rb") as f:
                        return await context.video_from_io(f)


class Trim(BaseNode):
    """
    Trim a video to a specific start and end time.
    video, trim, cut, segment

    Use cases:
    1. Extract specific segments from a longer video
    2. Remove unwanted parts from the beginning or end of a video
    3. Create shorter clips from a full-length video
    """

    video: VideoRef = Field(default=VideoRef(), description="The input video to trim.")
    start_time: float = Field(
        default=0.0, description="The start time in seconds for the trimmed video."
    )
    end_time: float = Field(
        default=-1.0,
        description="The end time in seconds for the trimmed video. Use -1 for the end of the video.",
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.video.is_empty():
            raise ValueError("Input video must be connected.")

        video_file = await context.asset_to_io(self.video)

        with tempfile.NamedTemporaryFile(suffix=".mp4") as temp:
            temp.write(video_file.read())

            input_stream = ffmpeg.input(temp.name)

            # Apply trimming
            if self.end_time > 0:
                trimmed = input_stream.trim(start=self.start_time, end=self.end_time)
            else:
                trimmed = input_stream.trim(start=self.start_time)

            with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                ffmpeg.output(trimmed, output_temp.name).overwrite_output().run(
                    quiet=False
                )

                # Read the trimmed video and create a VideoRef
                with open(output_temp.name, "rb") as f:
                    return await context.video_from_io(f)


class VideoResizeNode(BaseNode):
    """
    Resize a video to a specific width and height.
    video, resize, scale, dimensions

    Use cases:
    1. Adjust video resolution for different display requirements
    2. Reduce file size by downscaling video
    3. Prepare videos for specific platforms with size constraints
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to resize."
    )
    width: int = Field(
        default=-1, description="The target width. Use -1 to maintain aspect ratio."
    )
    height: int = Field(
        default=-1, description="The target height. Use -1 to maintain aspect ratio."
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.video.is_empty():
            raise ValueError("Input video must be connected.")

        video_file = await context.asset_to_io(self.video)

        with tempfile.NamedTemporaryFile(suffix=".mp4") as temp:
            temp.write(video_file.read())

            input_stream = ffmpeg.input(temp.name)

            # Apply resizing
            resized = input_stream.filter("scale", self.width, self.height)

            with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                ffmpeg.output(resized, output_temp.name).overwrite_output().run(
                    quiet=False
                )

                # Read the resized video and create a VideoRef
                with open(output_temp.name, "rb") as f:
                    return await context.video_from_io(f)


class Rotate(BaseNode):
    """
    Rotate a video by a specified angle.
    video, rotate, orientation, transform

    Use cases:
    1. Correct orientation of videos taken with a rotated camera
    2. Create artistic effects by rotating video content
    3. Adjust video for different display orientations
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to rotate."
    )
    angle: float = Field(
        default=0.0, description="The angle of rotation in degrees.", ge=-360, le=360
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.video.is_empty():
            raise ValueError("Input video must be connected.")

        video_file = await context.asset_to_io(self.video)

        with tempfile.NamedTemporaryFile(suffix=".mp4") as temp:
            temp.write(video_file.read())

            input_stream = ffmpeg.input(temp.name)

            # translate angle to radians
            angle = np.radians(self.angle)
            rotated = input_stream.filter("rotate", angle=angle)

            with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                ffmpeg.output(rotated, output_temp.name).overwrite_output().run(
                    quiet=False
                )

                # Read the rotated video and create a VideoRef
                with open(output_temp.name, "rb") as f:
                    return await context.video_from_io(f)


class SetSpeed(BaseNode):
    """
    Adjust the playback speed of a video.
    video, speed, tempo, time

    Use cases:
    1. Create slow-motion effects by decreasing video speed
    2. Generate time-lapse videos by increasing playback speed
    3. Synchronize video duration with audio or other timing requirements
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to adjust speed."
    )
    speed_factor: float = Field(
        default=1.0,
        description="The speed adjustment factor. Values > 1 speed up, < 1 slow down.",
        gt=0,
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.video.is_empty():
            raise ValueError("Input video must be connected.")

        video_file = await context.asset_to_io(self.video)

        with tempfile.NamedTemporaryFile(suffix=".mp4") as temp:
            temp.write(video_file.read())

            input_stream = ffmpeg.input(temp.name)

            # Apply speed adjustment
            adjusted = input_stream.filter("setpts", f"{1/self.speed_factor}*PTS")

            with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                ffmpeg.output(adjusted, output_temp.name).overwrite_output().run(
                    quiet=False
                )

                # Read the speed-adjusted video and create a VideoRef
                with open(output_temp.name, "rb") as f:
                    return await context.video_from_io(f)


class Overlay(BaseNode):
    """
    Overlay one video on top of another.
    video, overlay, composite, picture-in-picture

    Use cases:
    1. Add watermarks or logos to videos
    2. Create picture-in-picture effects
    3. Combine multiple video streams into a single output
    """

    main_video: VideoRef = Field(
        default=VideoRef(), description="The main (background) video."
    )
    overlay_video: VideoRef = Field(
        default=VideoRef(), description="The video to overlay on top."
    )
    x: int = Field(default=0, description="X-coordinate for overlay placement.")
    y: int = Field(default=0, description="Y-coordinate for overlay placement.")
    scale: float = Field(
        default=1.0, description="Scale factor for the overlay video.", gt=0
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.main_video.is_empty() or self.overlay_video.is_empty():
            raise ValueError("Both main and overlay videos must be connected.")

        main_video_file = await context.asset_to_io(self.main_video)
        overlay_video_file = await context.asset_to_io(self.overlay_video)

        with tempfile.NamedTemporaryFile(
            suffix=".mp4"
        ) as main_temp, tempfile.NamedTemporaryFile(suffix=".mp4") as overlay_temp:
            main_temp.write(main_video_file.read())
            overlay_temp.write(overlay_video_file.read())

            main_input = ffmpeg.input(main_temp.name)
            overlay_input = ffmpeg.input(overlay_temp.name)

            # Scale the overlay video
            scaled_overlay = overlay_input.filter(
                "scale", f"iw*{self.scale}", f"ih*{self.scale}"
            )

            # Apply the overlay
            output = ffmpeg.overlay(main_input, scaled_overlay, x=self.x, y=self.y)

            with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                output.output(output_temp.name).overwrite_output().run(quiet=False)

                # Read the overlaid video and create a VideoRef
                with open(output_temp.name, "rb") as f:
                    return await context.video_from_io(f)


class ColorBalance(BaseNode):
    """
    Adjust the color balance of a video.
    video, color, balance, adjustment

    Use cases:
    1. Correct color casts in video footage
    2. Enhance specific color tones for artistic effect
    3. Normalize color balance across multiple video clips
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to adjust color balance."
    )
    red_adjust: float = Field(
        default=1.0, description="Red channel adjustment factor.", ge=0, le=2
    )
    green_adjust: float = Field(
        default=1.0, description="Green channel adjustment factor.", ge=0, le=2
    )
    blue_adjust: float = Field(
        default=1.0, description="Blue channel adjustment factor.", ge=0, le=2
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.video.is_empty():
            raise ValueError("Input video must be connected.")

        video_file = await context.asset_to_io(self.video)

        with tempfile.NamedTemporaryFile(suffix=".mp4") as temp:
            temp.write(video_file.read())

            input_stream = ffmpeg.input(temp.name)

            # Apply color balance adjustment
            adjusted = input_stream.filter(
                "colorbalance",
                rs=self.red_adjust - 1,
                gs=self.green_adjust - 1,
                bs=self.blue_adjust - 1,
            )

            with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                ffmpeg.output(adjusted, output_temp.name).overwrite_output().run(
                    quiet=False
                )

                # Read the color-adjusted video and create a VideoRef
                with open(output_temp.name, "rb") as f:
                    return await context.video_from_io(f)


class Denoise(BaseNode):
    """
    Apply noise reduction to a video.
    video, denoise, clean, enhance

    Use cases:
    1. Improve video quality by reducing unwanted noise
    2. Enhance low-light footage
    3. Prepare video for further processing or compression
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to denoise."
    )
    strength: float = Field(
        default=5.0,
        description="Strength of the denoising effect. Higher values mean more denoising.",
        ge=0,
        le=20,
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.video.is_empty():
            raise ValueError("Input video must be connected.")

        video_file = await context.asset_to_io(self.video)

        with tempfile.NamedTemporaryFile(suffix=".mp4") as temp:
            temp.write(video_file.read())

            input_stream = ffmpeg.input(temp.name)

            # Apply denoising filter
            denoised = input_stream.filter("nlmeans", s=self.strength)

            with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                ffmpeg.output(denoised, output_temp.name).overwrite_output().run(
                    quiet=False
                )

                # Read the denoised video and create a VideoRef
                with open(output_temp.name, "rb") as f:
                    return await context.video_from_io(f)


class Stabilize(BaseNode):
    """
    Apply video stabilization to reduce camera shake and jitter.
    video, stabilize, smooth, shake-reduction

    Use cases:
    1. Improve quality of handheld or action camera footage
    2. Smooth out panning and tracking shots
    3. Enhance viewer experience by reducing motion sickness
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to stabilize."
    )
    smoothing: float = Field(
        default=10.0,
        description="Smoothing strength. Higher values result in smoother but potentially more cropped video.",
        ge=1,
        le=100,
    )
    crop_black: bool = Field(
        default=True,
        description="Whether to crop black borders that may appear after stabilization.",
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.video.is_empty():
            raise ValueError("Input video must be connected.")

        video_file = await context.asset_to_io(self.video)

        with tempfile.NamedTemporaryFile(suffix=".mp4") as temp:
            temp.write(video_file.read())

            input_stream = ffmpeg.input(temp.name)

            # Apply video stabilization
            stabilized = input_stream.filter("deshake", smooth=self.smoothing)

            # Optionally crop black borders
            if self.crop_black:
                stabilized = stabilized.filter("cropdetect").filter("crop")

            with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                ffmpeg.output(stabilized, output_temp.name).overwrite_output().run(
                    quiet=False
                )

                # Read the stabilized video and create a VideoRef
                with open(output_temp.name, "rb") as f:
                    return await context.video_from_io(f)


class Sharpness(BaseNode):
    """
    Adjust the sharpness of a video.
    video, sharpen, enhance, detail

    Use cases:
    1. Enhance detail in slightly out-of-focus footage
    2. Correct softness introduced by video compression
    3. Create stylistic effects by over-sharpening
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to sharpen."
    )
    luma_amount: float = Field(
        default=1.0,
        description="Amount of sharpening to apply to luma (brightness) channel.",
        ge=0,
        le=3,
    )
    chroma_amount: float = Field(
        default=0.5,
        description="Amount of sharpening to apply to chroma (color) channels.",
        ge=0,
        le=3,
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.video.is_empty():
            raise ValueError("Input video must be connected.")

        video_file = await context.asset_to_io(self.video)

        with tempfile.NamedTemporaryFile(suffix=".mp4") as temp:
            temp.write(video_file.read())

            input_stream = ffmpeg.input(temp.name)

            # Apply unsharp mask filter for sharpening
            sharpened = input_stream.filter(
                "unsharp",
                luma_msize_x=5,  # 5x5 matrix for luma
                luma_msize_y=5,
                luma_amount=self.luma_amount,
                chroma_msize_x=5,  # 5x5 matrix for chroma
                chroma_msize_y=5,
                chroma_amount=self.chroma_amount,
            )

            with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                ffmpeg.output(sharpened, output_temp.name).overwrite_output().run(
                    quiet=False
                )

                # Read the sharpened video and create a VideoRef
                with open(output_temp.name, "rb") as f:
                    return await context.video_from_io(f)


class Blur(BaseNode):
    """
    Apply a blur effect to a video.
    video, blur, smooth, soften

    Use cases:
    1. Create a dreamy or soft focus effect
    2. Obscure or censor specific areas of the video
    3. Reduce noise or grain in low-quality footage
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to apply blur effect."
    )
    strength: float = Field(
        default=5.0,
        description="The strength of the blur effect. Higher values create a stronger blur.",
        ge=0,
        le=20,
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.video.is_empty():
            raise ValueError("Input video must be connected.")

        video_file = await context.asset_to_io(self.video)

        with tempfile.NamedTemporaryFile(suffix=".mp4") as temp:
            temp.write(video_file.read())

            input_stream = ffmpeg.input(temp.name)

            # Apply boxblur filter
            blurred = input_stream.filter("boxblur", luma_radius=self.strength)

            with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                ffmpeg.output(blurred, output_temp.name).overwrite_output().run(
                    quiet=False
                )

                # Read the blurred video and create a VideoRef
                with open(output_temp.name, "rb") as f:
                    return await context.video_from_io(f)


class Saturation(BaseNode):
    """
    Adjust the color saturation of a video.
    video, saturation, color, enhance

    Use cases:
    1. Enhance color vibrancy in dull or flat-looking footage
    2. Create stylistic effects by over-saturating or desaturating video
    3. Correct oversaturated footage from certain cameras
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to adjust saturation."
    )
    saturation: float = Field(
        default=1.0,
        description="Saturation level. 1.0 is original, <1 decreases saturation, >1 increases saturation.",
        ge=0,
        le=3,
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.video.is_empty():
            raise ValueError("Input video must be connected.")

        video_file = await context.asset_to_io(self.video)

        with tempfile.NamedTemporaryFile(suffix=".mp4") as temp:
            temp.write(video_file.read())

            input_stream = ffmpeg.input(temp.name)

            # Apply saturation adjustment
            saturated = input_stream.filter("eq", saturation=self.saturation)

            with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                ffmpeg.output(saturated, output_temp.name).overwrite_output().run(
                    quiet=False
                )

                # Read the saturation-adjusted video and create a VideoRef
                with open(output_temp.name, "rb") as f:
                    return await context.video_from_io(f)


class AddSubtitles(BaseNode):
    """
    Add subtitles to a video.
    video, subtitles, text, caption

    Use cases:
    1. Add translations or closed captions to videos
    2. Include explanatory text or commentary in educational videos
    3. Create lyric videos for music content
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to add subtitles to."
    )
    subtitles: TextRef | str = Field(default="", description="SRT Subtitles.")
    font_size: int = Field(
        default=24, description="Font size for the subtitles.", ge=8, le=72
    )
    font_color: str = Field(
        default="white",
        description="Color of the subtitle text. Use predefined colors (white, black, gray, red, yellow) or hex color code (e.g., '#FF0000').",
    )
    outline_color: str = Field(
        default="black",
        description="Color of the text outline. Use predefined colors (white, black, gray, red, yellow) or hex color code (e.g., '#000000').",
    )
    outline_width: int = Field(
        default=2, description="Width of the text outline.", ge=0, le=4
    )
    position: str = Field(
        default="bottom",
        description="Position of the subtitles. Options: 'bottom', 'top', 'middle'.",
    )

    def normalize_path(self, path):
        return os.path.normpath(path).replace("\\", "/")

    def color_to_hex(self, color):
        color_map = {
            "white": "FFFFFF",
            "black": "000000",
            "gray": "808080",
            "red": "FF0000",
            "yellow": "FFFF00",
        }
        if color.lower() in color_map:
            return color_map[color.lower()]
        elif re.match(r"^#?[0-9A-Fa-f]{6}$", color):
            return color.lstrip("#")
        else:
            raise ValueError(
                f"Invalid color: {color}. Use predefined colors or hex color code."
            )

    async def process(self, context: ProcessingContext) -> VideoRef:
        if self.video.is_empty():
            raise ValueError("Input video must be connected.")

        video_file = await context.asset_to_io(self.video)

        if isinstance(self.subtitles, TextRef):
            srt_file = await context.asset_to_io(self.subtitles)
            srt_content = srt_file.read().decode("utf-8")
        else:
            srt_content = self.subtitles

        temp_input = None
        temp_srt = None
        temp_output = None

        try:
            temp_input = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
            temp_srt = tempfile.NamedTemporaryFile(suffix=".srt", delete=False)
            temp_output = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)

            temp_input.write(video_file.read())
            temp_srt.write(srt_content.encode("utf-8"))

            temp_input.close()
            temp_srt.close()
            temp_output.close()

            input_path = self.normalize_path(temp_input.name)
            srt_path = self.normalize_path(temp_srt.name)
            output_path = self.normalize_path(temp_output.name)

            font_color_hex = self.color_to_hex(self.font_color)
            outline_color_hex = self.color_to_hex(self.outline_color)

            # Set vertical position based on the 'position' field
            if self.position == "bottom":
                vertical_position = "(h-th)"
            elif self.position == "top":
                vertical_position = "0"
            else:  # middle
                vertical_position = "(h-th)/2"

            try:
                (
                    ffmpeg.input(input_path)
                    .filter(
                        "subtitles",
                        filename=srt_path,
                        force_style=f"FontSize={self.font_size},PrimaryColour=&H{font_color_hex},OutlineColour=&H{outline_color_hex},Outline={self.outline_width},BorderStyle=3,Alignment=2,MarginV=20,y={vertical_position}",
                    )
                    .output(
                        output_path, vcodec="libx264", acodec="aac", **{"map": "0:a"}
                    )
                    .overwrite_output()
                    .run(capture_stdout=True, capture_stderr=True)
                )

                with open(temp_output.name, "rb") as f:
                    return await context.video_from_io(f)

            except ffmpeg.Error as e:
                print(f"stdout: {e.stdout.decode('utf8')}")
                print(f"stderr: {e.stderr.decode('utf8')}")
                raise RuntimeError(f"ffmpeg error: {e.stderr.decode('utf8')}")

        except Exception as e:
            raise RuntimeError(f"Error processing video: {str(e)}") from e

        finally:
            # Ensure files are closed before attempting to delete
            for temp_file in [temp_input, temp_srt, temp_output]:
                if temp_file:
                    temp_file.close()

            # Attempt to delete files with retry
            for temp_file in [temp_input, temp_srt, temp_output]:
                if temp_file and os.path.exists(temp_file.name):
                    for _ in range(5):  # Try up to 5 times
                        try:
                            os.unlink(temp_file.name)
                            break
                        except PermissionError:
                            time.sleep(0.1)  # Wait a bit before retrying


class Reverse(BaseNode):
    """
    Reverse the playback of a video.
    video, reverse, backwards, effect

    Use cases:
    1. Create artistic effects by playing video in reverse
    2. Analyze motion or events in reverse order
    3. Generate unique transitions or intros for video projects
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to reverse."
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.video.is_empty():
            raise ValueError("Input video must be connected.")

        video_file = await context.asset_to_io(self.video)

        with tempfile.NamedTemporaryFile(suffix=".mp4") as temp:
            temp.write(video_file.read())

            input_stream = ffmpeg.input(temp.name)

            reversed_video = input_stream.filter("reverse")

            with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                ffmpeg.output(reversed_video, output_temp.name).overwrite_output().run(
                    quiet=False
                )

                # Read the reversed video and create a VideoRef
                with open(output_temp.name, "rb") as f:
                    return await context.video_from_io(f)


class Transition(BaseNode):
    """
    Create a transition effect between two videos.
    video, transition, effect, merge

    Use cases:
    1. Create smooth transitions between video clips in a montage
    2. Add professional-looking effects to video projects
    3. Blend scenes together for creative storytelling
    """

    class TransitionType(str, enum.Enum):
        fade = "fade"
        wipeleft = "wipeleft"
        wiperight = "wiperight"
        wipeup = "wipeup"
        wipedown = "wipedown"
        slideleft = "slideleft"
        slideright = "slideright"
        slideup = "slideup"
        slidedown = "slidedown"
        circlecrop = "circlecrop"
        rectcrop = "rectcrop"
        distance = "distance"
        fadeblack = "fadeblack"
        fadewhite = "fadewhite"
        radial = "radial"
        smoothleft = "smoothleft"
        smoothright = "smoothright"
        smoothup = "smoothup"
        smoothdown = "smoothdown"
        circleopen = "circleopen"
        circleclose = "circleclose"
        vertopen = "vertopen"
        vertclose = "vertclose"
        horzopen = "horzopen"
        horzclose = "horzclose"
        dissolve = "dissolve"
        pixelize = "pixelize"
        diagtl = "diagtl"
        diagtr = "diagtr"
        diagbl = "diagbl"
        diagbr = "diagbr"
        hlslice = "hlslice"
        hrslice = "hrslice"
        vuslice = "vuslice"
        vdslice = "vdslice"
        hblur = "hblur"
        fadegrays = "fadegrays"
        wipetl = "wipetl"
        wipetr = "wipetr"
        wipebl = "wipebl"
        wipebr = "wipebr"
        squeezeh = "squeezeh"
        squeezev = "squeezev"
        zoomin = "zoomin"
        fadefast = "fadefast"
        fadeslow = "fadeslow"
        hlwind = "hlwind"
        hrwind = "hrwind"
        vuwind = "vuwind"
        vdwind = "vdwind"
        coverleft = "coverleft"
        coverright = "coverright"
        coverup = "coverup"
        coverdown = "coverdown"
        revealleft = "revealleft"
        revealright = "revealright"
        revealup = "revealup"
        revealdown = "revealdown"

    video_a: VideoRef = Field(
        default=VideoRef(), description="The first video in the transition."
    )
    video_b: VideoRef = Field(
        default=VideoRef(), description="The second video in the transition."
    )
    transition_type: TransitionType = Field(
        default=TransitionType.fade, description="Type of transition effect"
    )
    duration: float = Field(
        default=1.0,
        description="Duration of the transition effect in seconds.",
        ge=0.1,
        le=5.0,
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.video_a.is_empty() or self.video_b.is_empty():
            raise ValueError("Both input videos must be connected.")

        video_a_file = await context.asset_to_io(self.video_a)
        video_b_file = await context.asset_to_io(self.video_b)

        with tempfile.NamedTemporaryFile(
            suffix=".mp4"
        ) as temp_a, tempfile.NamedTemporaryFile(suffix=".mp4") as temp_b:
            temp_a.write(video_a_file.read())
            temp_b.write(video_b_file.read())

            input_a = ffmpeg.input(temp_a.name)
            input_b = ffmpeg.input(temp_b.name)

            transition = ffmpeg.filter(
                [input_a, input_b],
                "xfade",
                transition=self.transition_type.value,
                duration=self.duration,
            )

            with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                ffmpeg.output(transition, output_temp.name).overwrite_output().run(
                    quiet=False
                )

                # Read the transitioned video and create a VideoRef
                with open(output_temp.name, "rb") as f:
                    return await context.video_from_io(f)


class AddAudio(BaseNode):
    """
    Add an audio track to a video, replacing or mixing with existing audio.
    video, audio, soundtrack, merge

    Use cases:
    1. Add background music or narration to a silent video
    2. Replace original audio with a new soundtrack
    3. Mix new audio with existing video sound
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to add audio to."
    )
    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to add to the video."
    )
    volume: float = Field(
        default=1.0,
        description="Volume adjustment for the added audio. 1.0 is original volume.",
        ge=0,
        le=2,
    )
    mix: bool = Field(
        default=False,
        description="If True, mix new audio with existing. If False, replace existing audio.",
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.video.is_empty() or self.audio.is_empty():
            raise ValueError("Both video and audio inputs must be connected.")

        video_file = await context.asset_to_io(self.video)
        audio_file = await context.asset_to_io(self.audio)

        with tempfile.NamedTemporaryFile(
            suffix=".mp4"
        ) as temp_video, tempfile.NamedTemporaryFile(suffix=".mp3") as temp_audio:
            temp_video.write(video_file.read())
            temp_audio.write(audio_file.read())

            video_input = ffmpeg.input(temp_video.name)
            audio_input = ffmpeg.input(temp_audio.name)

            audio_input = audio_input.filter("volume", volume=self.volume)

            if self.mix:
                # Mix new audio with existing video audio
                audio = ffmpeg.filter(
                    [video_input.audio, audio_input], "amix", inputs=2
                )
            else:
                # Replace video audio with new audio
                audio = audio_input

            with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                try:
                    ffmpeg.output(
                        video_input.video, audio, output_temp.name, format="mp4"
                    ).overwrite_output().run(quiet=False)
                except ffmpeg.Error as e:
                    raise ValueError(f"Error processing video: {e.stderr[-256:]}")

                # Read the video with added audio and create a VideoRef
                with open(output_temp.name, "rb") as f:
                    return await context.video_from_io(f)


class ChromaKey(BaseNode):
    """
    Apply chroma key (green screen) effect to a video.
    video, chroma key, green screen, compositing

    Use cases:
    1. Remove green or blue background from video footage
    2. Create special effects by compositing video onto new backgrounds
    3. Produce professional-looking videos for presentations or marketing
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to apply chroma key effect."
    )
    key_color: str = Field(
        default="0x00FF00",
        description="The color to key out (e.g., '0x00FF00' for green).",
    )
    similarity: float = Field(
        default=0.3,
        description="Similarity threshold for the key color.",
        ge=0.0,
        le=1.0,
    )
    blend: float = Field(
        default=0.1, description="Blending of the keyed area edges.", ge=0.0, le=1.0
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        import ffmpeg

        if self.video.is_empty():
            raise ValueError("Input video must be connected.")

        video_file = await context.asset_to_io(self.video)

        with tempfile.NamedTemporaryFile(suffix=".mp4") as temp:
            temp.write(video_file.read())

            input_stream = ffmpeg.input(temp.name)

            # Apply chroma key filter
            keyed = input_stream.filter(
                "chromakey",
                color=self.key_color,
                similarity=self.similarity,
                blend=self.blend,
            )

            with tempfile.NamedTemporaryFile(suffix=".mp4") as output_temp:
                ffmpeg.output(keyed, output_temp.name).overwrite_output().run(
                    quiet=False
                )

                # Read the chroma keyed video and create a VideoRef
                with open(output_temp.name, "rb") as f:
                    return await context.video_from_io(f)


import os
import tempfile
import ffmpeg


class ExtractAudio(BaseNode):
    """
    Separate audio from a video file.
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to separate."
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        if self.video.is_empty():
            raise ValueError("Input video must be connected.")

        video_file = await context.asset_to_io(self.video)

        # Create a temporary file for the input video
        video_fd, temp_input_path = tempfile.mkstemp(suffix=".mp4")
        os.close(video_fd)  # Close the file descriptor as we'll open it manually
        try:
            with open(temp_input_path, "wb") as temp_input:
                temp_input.write(video_file.read())

            # Create a temporary file for the extracted audio
            audio_fd, temp_audio_path = tempfile.mkstemp(suffix=".mp3")
            os.close(audio_fd)  # Close immediately since ffmpeg will handle the file

            try:
                # Extract the audio
                (
                    ffmpeg.input(temp_input_path)
                    .output(
                        temp_audio_path,
                        acodec="libmp3lame",
                        map="0:a",
                        format="mp3",
                        loglevel="error",
                    )
                    .overwrite_output()
                    .run(quiet=True)
                )

                # Read the extracted audio and return it
                with open(temp_audio_path, "rb") as temp_audio:
                    return await context.audio_from_io(temp_audio)

            except ffmpeg.Error as e:
                # Capture ffmpeg errors and output to stderr for debugging
                error_message = (
                    e.stderr.decode("utf-8") if e.stderr else "Unknown ffmpeg error."
                )
                raise RuntimeError(f"ffmpeg error: {error_message}") from e

            finally:
                if os.path.exists(temp_audio_path):
                    os.remove(temp_audio_path)  # Clean up audio file

        except Exception as e:
            raise RuntimeError(f"Error processing video file: {e}") from e

        finally:
            if os.path.exists(temp_input_path):
                os.remove(temp_input_path)
