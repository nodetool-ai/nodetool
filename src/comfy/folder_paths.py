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

supported_pt_extensions = set([".ckpt", ".pt", ".bin", ".pth", ".safetensors"])

folder_names_and_paths = {}
models_dir = ""


def init_folder_paths(data_dir: str):
    global folder_names_and_paths
    global models_dir

    models_dir = os.path.join(data_dir, "models")

    print("COMFY models_dir: " + models_dir)

    custom_nodes_directory = os.path.join(
        os.path.dirname(os.path.dirname(os.path.realpath(__file__))),
        "comfy_custom_nodes",
    )

    def model_path(name):
        return os.path.join(models_dir, name)

    folder_names_and_paths = {
        "annotator": ([model_path("annotator")], supported_pt_extensions),
        "checkpoints": ([model_path("checkpoints")], supported_pt_extensions),
        "configs": ([model_path("configs")], [".yaml"]),
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
        "custom_nodes": ([custom_nodes_directory], []),
        "hypernetworks": ([model_path("hypernetworks")], supported_pt_extensions),
        "classifiers": ([model_path("classifiers")], {""}),
    }


filename_list_cache = {}


def add_model_folder_path(folder_name: str, full_folder_path: str):
    global folder_names_and_paths
    if folder_name in folder_names_and_paths:
        folder_names_and_paths[folder_name][0].append(full_folder_path)
    else:
        folder_names_and_paths[folder_name] = ([full_folder_path], set())


def get_folder_paths(folder_name: str) -> list[str]:
    return folder_names_and_paths[folder_name][0][:]


def recursive_search(directory, excluded_dir_names=None):
    if not os.path.isdir(directory):
        return [], {}

    if excluded_dir_names is None:
        excluded_dir_names = []

    result = []
    dirs = {directory: os.path.getmtime(directory)}
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


def filter_files_extensions(files, extensions):
    return sorted(
        list(
            filter(
                lambda a: os.path.splitext(a)[-1].lower() in extensions  # type: ignore
                or len(extensions) == 0,
                files,
            )
        )
    )


def get_full_path(folder_name, filename):
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


def get_filename_list_(folder_name):
    global folder_names_and_paths
    output_list = set()
    folders = folder_names_and_paths[folder_name]
    output_folders = {}

    for x in folders[0]:
        files, folders_all = recursive_search(x, excluded_dir_names=[".git"])
        output_list.update(filter_files_extensions(files, folders[1]))
        output_folders = {**output_folders, **folders_all}

    return (sorted(list(output_list)), output_folders, time.perf_counter())


def cached_filename_list_(folder_name):
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
    out = cached_filename_list_(folder_name)
    if out is None:
        out = get_filename_list_(folder_name)
        global filename_list_cache
        filename_list_cache[folder_name] = out
    return list(out[0])
