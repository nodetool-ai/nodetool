# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
#
# Copyright (c) @comfyanonymous
# Project Repository: https://github.com/comfyanonymous/ComfyUI

import os
import time
from typing import Optional, Union
import os

from nodetool.common.environment import Environment

supported_pt_extensions = set([".ckpt", ".pt", ".bin", ".pth", ".safetensors"])
filename_list_cache: dict[str, tuple[list[str], dict[str, float], float]] = {}
data_dir = Environment.get_comfy_folder()
models_dir = os.path.join(data_dir, "models")

custom_nodes_directory = os.path.join(
    os.path.dirname(os.path.dirname(os.path.realpath(__file__))),
    "comfy_custom_nodes",
)


def model_path(name: str) -> str:
    return os.path.join(models_dir, name)


folder_names_and_paths: dict[str, tuple[list[str], set[str]]] = {
    "annotator": ([model_path("annotator")], supported_pt_extensions),
    "checkpoints": ([model_path("checkpoints")], supported_pt_extensions),
    "configs": ([model_path("configs")], set([".yaml"])),
    "loras": ([model_path("loras")], supported_pt_extensions),
    "vae": ([model_path("vae")], supported_pt_extensions),
    "clip": ([model_path("clip")], supported_pt_extensions),
    "unet": ([model_path("unet")], supported_pt_extensions),
    "clip_vision": ([model_path("clip_vision")], supported_pt_extensions),
    "style_models": ([model_path("style_models")], supported_pt_extensions),
    "embeddings": ([model_path("embeddings")], supported_pt_extensions),
    "vae_approx": ([model_path("vae_approx")], supported_pt_extensions),
    "controlnet": (
        [model_path("controlnet"), model_path("t2i_adapter")],
        supported_pt_extensions,
    ),
    "gligen": ([model_path("gligen")], supported_pt_extensions),
    "upscale_models": ([model_path("upscale_models")], supported_pt_extensions),
    "custom_nodes": ([custom_nodes_directory], set()),
    "hypernetworks": ([model_path("hypernetworks")], supported_pt_extensions),
    "classifiers": ([model_path("classifiers")], {""}),
}

print("Initializing comfy folder paths")
for name in ["checkpoints", "loras"]:
    print("Searching for ", name)
    for file in os.listdir(folder_names_and_paths[name][0][0]):
        print("Found ", file)


def add_model_folder_path(folder_name: str, full_folder_path: str):
    """
    Add a new folder path for a specific model type.

    Args:
        folder_name (str): The name of the model type.
        full_folder_path (str): The full path to the folder containing the models.
    """
    global folder_names_and_paths
    if folder_name in folder_names_and_paths:
        folder_names_and_paths[folder_name][0].append(full_folder_path)
    else:
        folder_names_and_paths[folder_name] = ([full_folder_path], set())


def get_folder_paths(folder_name: str) -> list[str]:
    """
    Get the folder paths for a specific model type.

    Args:
        folder_name (str): The name of the model type.

    Returns:
        list[str]: The list of folder paths for the specified model type.
    """
    return folder_names_and_paths[folder_name][0][:]


def recursive_search(
    directory: str, excluded_dir_names: Optional[list[str]] = None
) -> tuple[list[str], dict[str, float]]:
    """
    Recursively search for files in a directory and its subdirectories.

    Args:
        directory (str): The directory to search.
        excluded_dir_names (Optional[list[str]], optional): A list of directory names to exclude from the search. Defaults to None.

    Returns:
        tuple[list[str], dict[str, float]]: A tuple containing the list of file paths and a dictionary of directory paths and their modification times.
    """
    if not os.path.isdir(directory):
        return [], {}

    if excluded_dir_names is None:
        excluded_dir_names = []

    result: list[str] = []
    dirs: dict[str, float] = {directory: os.path.getmtime(directory)}
    for dirpath, subdirs, filenames in os.walk(
        directory, followlinks=True, topdown=True
    ):
        subdirs[:] = [d for d in subdirs if d not in excluded_dir_names]
        for file_name in filenames:
            relative_path = os.path.relpath(os.path.join(dirpath, file_name), directory)
            result.append(relative_path)
        for d in subdirs:
            path = os.path.join(dirpath, d)
            dirs[path] = os.path.getmtime(path)
    return result, dirs


def filter_files_extensions(files: list[str], extensions: list[str]) -> list[str]:
    """
    Filter a list of file paths based on their extensions.

    Args:
        files (list[str]): The list of file paths.
        extensions (list[str]): The list of allowed extensions.

    Returns:
        list[str]: The filtered list of file paths.
    """
    return sorted(
        list(
            filter(
                lambda a: os.path.splitext(a)[-1].lower() in extensions
                or len(extensions) == 0,
                files,
            )
        )
    )


def get_full_path(folder_name: str, filename: str) -> str | None:
    """
    Get the full path of a file given its folder name and filename.

    Args:
        folder_name (str): The name of the folder.
        filename (str): The name of the file.

    Returns:
        str | None: The full path of the file if found, None otherwise.
    """
    global folder_names_and_paths
    if folder_name not in folder_names_and_paths:
        return None
    folders = folder_names_and_paths[folder_name]
    filename = os.path.relpath(os.path.join("/", filename), "/")
    for x in folders[0]:
        full_path = os.path.join(x, filename)
        if os.path.isfile(full_path):
            return full_path

    return None


def get_filename_list_(folder_name: str) -> tuple[list[str], dict[str, float], float]:
    """
    Get the list of filenames and folder modification times for a specific folder.

    Args:
        folder_name (str): The name of the folder.

    Returns:
        tuple[list[str], dict[str, float], float]: A tuple containing the list of filenames, a dictionary of folder paths and their modification times, and the current time.
    """
    global folder_names_and_paths
    output_list: set[str] = set()
    folders = folder_names_and_paths[folder_name]
    output_folders: dict[str, float] = {}

    for x in folders[0]:
        files, folders_all = recursive_search(x, excluded_dir_names=[".git"])
        output_list.update(filter_files_extensions(files, list(folders[1])))
        output_folders = {**output_folders, **folders_all}

    return (sorted(list(output_list)), output_folders, time.perf_counter())


def cached_filename_list_(
    folder_name: str,
) -> Optional[tuple[list[str], dict[str, float], float]]:
    """
    Get the cached list of filenames and folder modification times for a
    Args:
        folder_name (str): The name of the folder.

    Returns:
        Optional[Tuple[List[str], Dict[str, float], float]]: A tuple containing the cached list of filenames, a dictionary of folder paths and their modification times, and the cache timestamp if available, None otherwise.
    """
    global filename_list_cache
    global folder_names_and_paths
    if folder_name not in filename_list_cache:
        return None
    out = filename_list_cache[folder_name]
    if time.perf_counter() < (out[2] + 0.5):
        return out
    for x in out[1]:
        time_modified = out[1][x]
        folder = x
        if os.path.getmtime(folder) != time_modified:
            return None

    folders = folder_names_and_paths[folder_name]
    for x in folders[0]:
        if os.path.isdir(x):
            if x not in out[1]:
                return None

    return out


def get_filename_list(folder_name):
    """
    Get the list of filenames for a specific folder, using the cache if available.

    Args:
        folder_name (str): The name of the folder.

    Returns:
        list[str]: The list of filenames for the specified folder.
    """
    out = cached_filename_list_(folder_name)
    if out is None:
        out = get_filename_list_(folder_name)
        global filename_list_cache
        filename_list_cache[folder_name] = out
    return list(out[0])
