import PIL.Image
import numpy as np
from PIL import ImageEnhance, ImageOps


def adaptive_contrast(
    image: PIL.Image.Image, clip_limit: float, grid_size: int
) -> PIL.Image.Image:
    import cv2

    img = np.array(image)

    # Convert image from BGR to LAB color model
    img_lab = cv2.cvtColor(img, cv2.COLOR_BGR2Lab)

    # Split the LAB image into L, A and B channels
    l, a, b = cv2.split(img_lab)

    # Perform histogram equalization only on the L channel
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(grid_size, grid_size))
    cl = clahe.apply(l)

    # Merge the CLAHE enhanced L channel with the original A and B channel
    merged_channels = cv2.merge((cl, a, b))

    # Convert image from LAB color model back to BGR
    final_img = cv2.cvtColor(merged_channels, cv2.COLOR_Lab2BGR)

    return PIL.Image.fromarray(final_img)


def sharpen_image(image: PIL.Image.Image) -> PIL.Image.Image:
    # Convert PIL image to CV
    import cv2

    img = np.array(image)
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    img_enhanced = cv2.filter2D(img, -1, kernel)
    return PIL.Image.fromarray(img_enhanced)


def canny_edge_detection(
    image: PIL.Image.Image, low_threshold: int, high_threshold: int
) -> PIL.Image.Image:
    import cv2

    arr = np.array(image)
    arr = cv2.Canny(arr, low_threshold, high_threshold)  # type: ignore
    arr = arr[:, :, None]
    arr = np.concatenate([arr, arr, arr], axis=2)
    return PIL.Image.fromarray(arr)
