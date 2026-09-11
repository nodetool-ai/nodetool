Targeted D1 retry only. Use NodeTool headless tools and `fal_ai` only. No browser/UI/CUA. Do not touch any shot except AD-S4 and AD-S1C. Reconcile storyboard `af795795297f43bf9e66d0318f422c83` first.

Immutable reference entity/asset: `382922e1ca1543468d59f0af5575350e`. Use direct `edit_image` with FAL Seedream v4.5 Edit because the storyboard route returned 422. This is the first quality retry after the provider-route failures, within the two-retry ceiling.

AD-S4 changed instruction: `Create exactly one Olive Travel Cup, fully isolated in frame on pale stone. No second cup, no partial cup, no cropped cup at any edge, no duplicate lid, no extra object. Preserve the reference's muted-olive tapered body, single charcoal flat lid, and one rectangular opening. Front three-quarter hero view, cup below center, uncluttered space above, warm left window light.`

AD-S1C changed instruction: `Create exactly one Olive Travel Cup and no other object. Remove every dangling strand, hook, handle, cable, seam, accessory, or artifact. Preserve the reference's muted-olive tapered body, single charcoal flat lid, and one rectangular opening. Slightly elevated close view showing lid and upper body, space below, warm left window light.`

Generate one still retry for each. Attach each as a new selected keyframe version to its exact shot. Then generate one direct FAL Minimax H3 image-to-video clip from each accepted retry using the existing shot motion. Preserve and print exact new still asset IDs, clip asset IDs, generation IDs, models, failures, and cost/null. Do not generate any other media or package derivatives.
