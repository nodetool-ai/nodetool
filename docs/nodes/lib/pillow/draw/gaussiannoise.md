---
layout: page
title: "Gaussian Noise"
node_type: "lib.image.draw.GaussianNoise"
namespace: "lib.image.draw"
---

**Type:** `lib.image.draw.GaussianNoise`

**Namespace:** `lib.image.draw`

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
| mean | `float` |  | `0.0` |
| stddev | `float` |  | `1.0` |
| width | `int` |  | `512` |
| height | `int` |  | `512` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.image.draw](../) namespace.

