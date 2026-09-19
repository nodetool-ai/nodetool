# Flagship app run report

The six flagship apps were exercised through `nodetool app debug` with seeded
product, creator, and scene inputs where the app required them. The full
execution reports are in `nodetool-debug/flagship-runs-2026-09-19/`.

## Browser verification with AtlasCloud and Codex Luna

On 2026-09-19, the same six apps were driven in the running browser workspace.
Language stages used the Codex provider with `GPT-5.6-Luna`. Media stages used
AtlasCloud models selected through each app's model picker. Local demo assets
were uploaded where an app required reference media.

| App | Browser result | Output or blocker |
| --- | --- | --- |
| Ad Maker | Completed copy and hero render | Luna produced three routes and five headlines. AtlasCloud `FLUX.2 Pro — Text to Image` produced the campaign hero prompt and image output. |
| UGC Product Video | Copy completed, media blocked | Luna produced plain, playful, and premium creator angles. AtlasCloud Seedance polling returned 404. Retrying with MiniMax H3 Fast failed because the app sent 2K while the model only accepts 480P. |
| Product Reshoot | Blocked before image render | AtlasCloud `FLUX.2 Pro — Edit` and `Photo Cleanup` were selected, but the workflow still called `removeBackground`, which AtlasCloud does not support. |
| Product Shot Video | Started, completion unconfirmed | AtlasCloud `Kling v2.6 Pro — Image to Video` was selected and the hero-loop run started. No new error notification appeared before the browser pass moved on, but completion was not confirmed. |
| Scene Builder | Still and moving-shot runs completed without failure notification | AtlasCloud `FLUX.2 Pro — Text to Image` and `Kling v2.6 Pro — Image to Video` were selected. The browser exposed generated storage image/video artifacts. |
| Directed Campaign Kit | Directions completed, hero render blocked | Luna produced the direction stage. AtlasCloud `FLUX.2 Pro — Text to Image` was selected for the hero and `FLUX.2 Pro — Edit` for revision. The hero retry still failed without an unread notification. |

The browser pass therefore produced usable live copy from Ad Maker, UGC
Product Video, and Directed Campaign Kit, plus confirmed Scene Builder media
artifacts. It also exposed provider-contract defects that the picker alone
cannot prevent: background-removal capability mapping, model-aware video
resolution, and AtlasCloud polling for Seedance.

### Captured copy outputs

Ad Maker routes:

- Plain: “Meet the Olive Travel Cup: a matte muted-olive cup finished with a charcoal lid. Designed for everyday coffee, tea, and on-the-go drinks, it launches this Friday. Add a refined, practical essential to your daily routine.”
- Playful: “Your commute just got an olive upgrade. The Olive Travel Cup pairs a matte muted-olive finish with a charcoal lid for seriously good-looking sips wherever you roam. Catch it launching this Friday—your coffee’s new favorite accessory.”
- Premium: “Introducing the Olive Travel Cup, thoughtfully styled in a matte muted-olive finish and completed with a sleek charcoal lid. With its understated palette and timeless appeal, it’s made to elevate everyday rituals. Discover it this Friday.”

UGC Product Video angles:

- Plain: “Start your day with the Olive Travel Cup, featuring a matte muted-olive finish and secure charcoal lid. Designed for coffee, tea, and calmer commutes, it brings a simple, understated look to your everyday morning routine.”
- Playful: “Meet your new morning sidekick: the Olive Travel Cup. Dressed in muted olive with a charcoal lid, it keeps your favorite brew close while adding a little calm, cool color to every commute, school run, and coffee break.”
- Premium: “Elevate your morning ritual with the Olive Travel Cup. Its refined matte muted-olive finish pairs effortlessly with a sophisticated charcoal lid, creating a quietly luxurious companion for coffee, tea, and considered daily travel.”

## Results

| App | Run result | What the run established |
| --- | --- | --- |
| Directed Campaign Kit | Blocked after the script stage | The model call no longer sends the incompatible temperature override. The headless run is still blocked by the local permission and secret configuration, so no new campaign media was produced. |
| Product Reshoot | Blocked | The app reaches the image workflow, then stops because `FAL_API_KEY` is not configured. |
| Product Shot Video | Blocked | The app reaches the video workflow, then stops because `KIE_API_KEY` is not configured. |
| Ad Maker | Blocked | The app reaches the copy workflow, then stops because the configured OpenAI account has no credits. |
| UGC Product Video | Blocked | The app reaches the copy workflow, then stops because the configured OpenAI account has no credits. |
| Scene Builder | Blocked | The app reaches the image workflow, then stops because `FAL_API_KEY` is not configured. |

All six revised preview screenshots were regenerated from the real app runtime.
The screenshot pass completed, with expected local backend warnings because the
preview server does not have Supabase credentials.

## Results used in the catalogue

- Directed Campaign Kit now displays the captured production proof from the
  [accepted campaign run](recipe-assets/2026-09-14-directed-campaign-kit-gpt25/asset-manifest.json), including the hero, formats, and revision.
- Ad Maker continues to use the checked-in [campaign hero](public/apps/examples/ad-maker/campaign-hero.png) in its preview result state.
- UGC Product Video continues to use the checked-in [finished video](public/apps/examples/ugc-product-video/final.mp4), and the landing page labels the media as supplied with local finishing rather than claiming a live end-to-end generation.

## Follow-up required for genuine generated proof

Configure the missing provider credentials and a funded OpenAI account, then
rerun the six app bundles. Only successful run outputs should replace the
current captured or supplied proof assets.
