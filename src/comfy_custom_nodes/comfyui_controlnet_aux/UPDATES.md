* `AIO Aux Preprocessor` intergrating all loadable aux preprocessors as dropdown options. Easy to copy, paste and get the preprocessor faster.
* Added OpenPose-format JSON output from OpenPose Preprocessor and DWPose Preprocessor. Checks [here](#faces-and-poses).
* Fixed wrong model path when downloading DWPose.
* Make hint images less blurry.
* Added `resolution` option, `PixelPerfectResolution` and `HintImageEnchance` nodes (TODO: Documentation).
* Added `RAFT Optical Flow Embedder` for TemporalNet2 (TODO: Workflow example).
* Fixed opencv's conflicts between this extension, [ReActor](https://github.com/Gourieff/comfyui-reactor-node) and Roop. Thanks `Gourieff` for [the solution](https://github.com/Fannovel16/comfyui_controlnet_aux/issues/7#issuecomment-1734319075)!
* RAFT is removed as the code behind it doesn't match what what the original code does
* Changed `lineart`'s display name from `Normal Lineart` to `Realistic Lineart`. This change won't affect old workflows
* Added support for `onnxruntime` to speed-up DWPose (see the Q&A)
* Fixed TypeError: expected size to be one of int or Tuple[int] or Tuple[int, int] or Tuple[int, int, int], but got size with types [<class 'numpy.int64'>, <class 'numpy.int64'>]: [Issue](https://github.com/Fannovel16/comfyui_controlnet_aux/issues/2), [PR](https://github.com/Fannovel16/comfyui_controlnet_aux/pull/71))
* Fixed ImageGenResolutionFromImage mishape (https://github.com/Fannovel16/comfyui_controlnet_aux/pull/74)
* Fixed LeRes and MiDaS's incomatipility with MPS device
* Fixed checking DWPose onnxruntime session multiple times: https://github.com/Fannovel16/comfyui_controlnet_aux/issues/89)
* Added `Anime Face Segmentor` (in `ControlNet Preprocessors/Semantic Segmentation`) for [ControlNet AnimeFaceSegmentV2](https://huggingface.co/bdsqlsz/qinglong_controlnet-lllite#animefacesegmentv2). Checks [here](#anime-face-segmentor)
* Change download functions and fix [download error](https://github.com/Fannovel16/comfyui_controlnet_aux/issues/39): [PR](https://github.com/Fannovel16/comfyui_controlnet_aux/pull/96)
* Caching DWPose Onnxruntime during the first use of DWPose node instead of ComfyUI startup
* Added alternative YOLOX models for faster speed when using DWPose
* Added alternative DWPose models
* Implemented the preprocessor for [AnimalPose ControlNet](https://github.com/abehonest/ControlNet_AnimalPose/tree/main). Check [Animal Pose AP-10K](#animal-pose-ap-10k) 
* Added YOLO-NAS models which are drop-in replacements of YOLOX
* Fixed Openpose Face/Hands no longer detecting: https://github.com/Fannovel16/comfyui_controlnet_aux/issues/54
* Added TorchScript implementation of DWPose and AnimalPose
* Added TorchScript implementation of DensePose from [Colab notebook](https://colab.research.google.com/drive/16hcaaKs210ivpxjoyGNuvEXZD4eqOOSQ) which doesn't require detectron2. [Example](#densepose). Thanks [@LayerNome](https://github.com/Layer-norm) for fixing bugs related.
* Added Standard Lineart Preprocessor
* Fixed OpenPose misplacements in some cases 
* Added Mesh Graphormer - Hand Depth Map & Mask
* Misaligned hands bug from MeshGraphormer was fixed