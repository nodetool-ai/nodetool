---
layout: page
title: "Gaussian Noise"
node_type: "lib.pillow.draw.GaussianNoise"
namespace: "lib.pillow.draw"
---

**Type:** `lib.pillow.draw.GaussianNoise`

**Namespace:** `lib.pillow.draw`

## Description

This node creates and adds Gaussian noise to an image.
    image, noise, gaussian, distortion, artifact

    The Gaussian Noise Node is designed to simulate realistic distortions that can occur in a photographic image. It generates a noise-filled image using the Gaussian (normal) distribution. The noise level can be adjusted using the mean and standard deviation parameters.

    #### Applications
    - Simulating sensor noise in synthetic data.
    - Testing image-processing algorithms' resilience to noise.
    - Creating artistic effects in images.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| mean | `any` |  | `0.0` |
| stddev | `any` |  | `1.0` |
| width | `any` |  | `512` |
| height | `any` |  | `512` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pillow.draw](../) namespace.

