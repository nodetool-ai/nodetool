// The guided steps of each ad library Recipe app.
//
// Each concept groups its fields by the material the user has, not by the
// timeline: "The offer" and "Your products" instead of "1.5–4 s · Range". Every
// group shows only the example frames its fields fill, by beat role. `cards`
// pairs an image with its line in one card when the ad pairs them. The Ending
// step is the same for every concept: the last copy slot, the logo and the
// brand color, beside the last beat.
//
// `exampleUrl` is a public page whose products and images fit the concept.
// The website fill offers it beside the URL field.
//
// `labels`, `placeholders` and `hints` are keyed by Recipe input id. A label
// here also renames the Recipe input, so the review and the AI fill use it.

/** A card holds one image, or one image and the line shown with it. */
const card = (image, text) => (text ? {image, text} : {image});

export const AD_STEPS = {
  "kinetic-offer-wall": {
    labels: {offerShort: "Offer", offerTerms: "Offer terms", product1: "Hero product", product2: "Product 2", product3: "Product 3", collectionLabel: "Range name", benefitShort: "Benefit"},
    placeholders: {offerShort: "30% off", offerTerms: "All packs, until 12 May", collectionLabel: "The summer range", benefitShort: "Lighter every day", cta: "Shop the offer"},
    hints: {offerShort: "Very short. It fills the top of the screen.", offerTerms: "Which products, and the end date.", benefitShort: "Shows while the hero product grows."},
    steps: [
      {key: "offer", title: "The offer", intro: "Start with the offer. It is the reason to act, so it opens the ad and comes back before the end.", groups: [
        {frames: ["hook", "proof_of_offer"], fields: ["offerShort", "offerTerms"]}]},
      {key: "products", title: "Your products", intro: "Three product cutouts on a plain or transparent background. The first one is the hero.", groups: [
        {frames: ["range", "benefit"], cards: [card("product1"), card("product2"), card("product3")], fields: ["collectionLabel", "benefitShort"]}]}
    ],
    ending: "Brand, product and the call to action hold together.",
    exampleUrl: "https://www.allbirds.com/collections/sale-mens"
  },
  "product-cutout-shuffle": {
    labels: {product1: "Hero pack", product2: "Pack 2", product3: "Pack 3", rangeHook: "Opening line", variant1: "Hero pack line", variant23: "Line for packs 2 and 3", rangeBenefit: "Range benefit"},
    placeholders: {rangeHook: "Meet the full range", variant1: "Bright citrus, no sugar", variant23: "Two more flavours", rangeBenefit: "One for every mood", cta: "Find your flavour"},
    hints: {product1: "A pack cutout on a plain or transparent background.", rangeHook: "Shows with the hero pack at full size.", variant1: "Names what makes this pack different.", rangeBenefit: "Shows when all three packs stand in a row."},
    steps: [
      {key: "hero", title: "Hero pack", intro: "The pack that opens the ad at full size, and the line for it.", groups: [
        {frames: ["hook", "variant_1"], fields: ["product1", "rangeHook", "variant1"]}]},
      {key: "variants", title: "Variants", intro: "Two more packs replace the hero at the same spot. They share one line.", groups: [
        {frames: ["variant_2", "range"], cards: [card("product2"), card("product3")], fields: ["variant23", "rangeBenefit"]}]}
    ],
    ending: "The whole range holds next to the call to action.",
    exampleUrl: "https://drinkolipop.com"
  },
  "one-hub-three-product-benefits": {
    labels: {hub: "Hub icon", featureCard1: "Benefit card 1", featureCard2: "Benefit card 2", featureCard3: "Benefit card 3", benefit1: "Benefit 1", benefit2: "Benefit 2", benefit3: "Benefit 3", outcomeAndCta: "Outcome and call to action"},
    placeholders: {problem: "Too many tools for one job", benefit1: "One inbox for every channel", benefit2: "Replies in seconds", benefit3: "Reports that write themselves", outcomeAndCta: "Everything in one place. Try it free"},
    hints: {hub: "Your product icon, ideally on a transparent background.", problem: "Plain words. The viewer knows the problem at once."},
    steps: [
      {key: "hub", title: "The hub", intro: "Your product icon sits in the center. The problem it solves shows next to it.", groups: [
        {frames: ["hook"], fields: ["hub", "problem"]}]},
      {key: "benefits", title: "Three benefits", intro: "Each card connects to the hub, one at a time. Give each card an image and one line.", groups: [
        {frames: ["feature_1", "feature_3"], cards: [card("featureCard1", "benefit1"), card("featureCard2", "benefit2"), card("featureCard3", "benefit3")]}]}
    ],
    ending: "All three cards stay on screen with the outcome and the call to action.",
    exampleUrl: "https://front.com"
  },
  "benefit-led-dashboard-punch-in": {
    labels: {uiCrop: "Product screen crop", resultState: "Result screen", outcomeHook: "Outcome headline", actionLabel: "Action", verifiedResult: "Result"},
    placeholders: {outcomeHook: "Close the month in one click", actionLabel: "Click Reconcile", verifiedResult: "All 214 invoices matched", context: "Right in your accounting dashboard, every month", cta: "Start free trial"},
    hints: {uiCrop: "A screenshot cropped to the control or row that matters.", outcomeHook: "Shows above the crop at the start.", actionLabel: "Names the highlighted control.", resultState: "The same view after the action, with the result visible.", verifiedResult: "A result the screen proves.", context: "Up to 16 words."},
    steps: [
      {key: "before", title: "Before", intro: "A close crop of your product screen and the step the user takes.", groups: [
        {frames: ["hook", "action"], fields: ["uiCrop", "outcomeHook", "actionLabel"]}]},
      {key: "after", title: "After", intro: "The same screen after the action, and where the result lives.", groups: [
        {frames: ["result", "context"], fields: ["resultState", "verifiedResult", "context"]}]}
    ],
    ending: "The result holds with one specific next step.",
    exampleUrl: "https://www.xero.com/us/"
  },
  "fast-footage-plus-kinetic-captions": {
    labels: {heroShot: "Hero shot", benefitShot1: "Benefit shot 1", benefitShot2: "Benefit shot 2", benefitShot3: "Benefit shot 3", ctaAndOffer: "Call to action and offer"},
    placeholders: {hook: "Glow in 10 minutes", benefit1: "No more dull mornings", benefit2: "Works under makeup", benefit3: "Results in one week", ctaAndOffer: "Shop now, 20% off"},
    hints: {heroShot: "A still of your best result. It comes back as the end card.", hook: "Shows with the hero shot at the start."},
    steps: [
      {key: "hero", title: "Hero shot", intro: "Your strongest result shot opens the ad and comes back at the end.", groups: [
        {frames: ["hook"], fields: ["heroShot", "hook"]}]},
      {key: "benefits", title: "Three benefits", intro: "Each benefit gets its own shot and caption. They switch together.", groups: [
        {frames: ["benefit_1", "benefit_3"], cards: [card("benefitShot1", "benefit1"), card("benefitShot2", "benefit2"), card("benefitShot3", "benefit3")]}]}
    ],
    ending: "The hero shot becomes an end card with the offer.",
    exampleUrl: "https://www.glossier.com"
  },
  "editorial-image-panels": {
    labels: {panel1: "Main image", panel2: "Panel 2", panel3: "Panel 3", benefit1: "Panel 2 line", benefit2: "Panel 3 line"},
    placeholders: {headline: "Made for slow mornings", promise: "Comfort that lasts", benefit1: "Soft organic cotton", benefit2: "Cut to move with you", cta: "Shop the collection"},
    hints: {panel1: "Your strongest image. It opens and closes the ad.", promise: "Shows when the main image comes back."},
    steps: [
      {key: "main", title: "Main image", intro: "One strong image and a headline open the ad. The image comes back with your promise.", groups: [
        {frames: ["hook", "hero"], fields: ["panel1", "headline", "promise"]}]},
      {key: "panels", title: "Two more panels", intro: "Each panel adds one image and one line to the grid.", groups: [
        {frames: ["panel_2", "panel_3"], cards: [card("panel2", "benefit1"), card("panel3", "benefit2")]}]}
    ],
    ending: "The main image holds with a clear next step.",
    exampleUrl: "https://organicbasics.com"
  },
  "binary-choice-participation-card": {
    labels: {choiceAImage: "Choice A", choiceBImage: "Choice B", choiceA: "Choice A text", choiceB: "Choice B text", participationCta: "Participation call to action"},
    placeholders: {question: "Which side are you on?", choiceA: "Morning run", choiceB: "Evening swim", comparePrompt: "Which one is you?", participationCta: "Comment A or B"},
    hints: {question: "Keep it under 8 words.", comparePrompt: "Shows with both choices side by side."},
    steps: [
      {key: "question", title: "Question", intro: "One context image and one short question.", groups: [
        {frames: ["question"], fields: ["contextImage", "question"]}]},
      {key: "choices", title: "Two choices", intro: "Both choices use the same treatment, so give them images of the same kind.", groups: [
        {frames: ["choice_a", "choice_b"], cards: [card("choiceAImage", "choiceA"), card("choiceBImage", "choiceB")]},
        {frames: ["compare"], fields: ["comparePrompt"]}]}
    ],
    ending: "Tell viewers exactly how to answer.",
    exampleUrl: "https://liquiddeath.com"
  },
  "desktop-chaos-to-one-clean-result": {
    labels: {window1: "Window 1", window2: "Window 2", window3: "Window 3", painDetail: "Pain detail", turningPoint: "Turning point", resultCard: "Result card"},
    placeholders: {problem: "Ten tabs for one report", painDetail: "Copy, paste, repeat", turningPoint: "Now it is one step", benefit: "Your report, ready in seconds", cta: "Try it free"},
    hints: {painDetail: "Shows as more windows pile up.", turningPoint: "Shows as the windows move together.", resultCard: "One clean screenshot or card of the result."},
    steps: [
      {key: "chaos", title: "The chaos", intro: "Three overlapping windows show the problem. Use screenshots of the tools people switch between.", groups: [
        {frames: ["hook", "pressure"], cards: [card("window1"), card("window2"), card("window3")], fields: ["problem", "painDetail"]}]},
      {key: "result", title: "The clean result", intro: "All the windows turn into one clean result.", groups: [
        {frames: ["turn", "result"], fields: ["turningPoint", "resultCard", "benefit"]}]}
    ],
    ending: "The result holds next to the call to action.",
    exampleUrl: "https://www.notion.com/product/ai"
  },
  "headline-plus-inset-motion-module": {
    labels: {hook: "Headline", moduleA: "Module A", moduleB: "Module B", benefitA: "Module A line", benefitB: "Module B line"},
    placeholders: {hook: "Edit video by editing text", payoff: "Done before lunch", benefitA: "Cut a word, cut the clip", benefitB: "Export in one click", cta: "Try it free"},
    hints: {hook: "Large, above the media window.", payoff: "Shows when the result settles near the end."},
    steps: [
      {key: "headline", title: "Headline", intro: "A large headline sits above a media window. It gets a short payoff near the end.", groups: [
        {frames: ["hook", "payoff"], fields: ["hook", "payoff"]}]},
      {key: "modules", title: "Two modules", intro: "The window shows two images in turn: the premise, then the result.", groups: [
        {frames: ["module_a", "module_b"], cards: [card("moduleA", "benefitA"), card("moduleB", "benefitB")]}]}
    ],
    ending: "A call to action strip shows below the media window.",
    exampleUrl: "https://www.descript.com"
  },
  "integration-puzzle-that-snaps-together": {
    labels: {tile1: "Tile 1", tile2: "Tile 2", tile3: "Tile 3", tile4: "Tile 4", integrationProblem: "Problem", connectionLabel: "Connection line", benefitDetail: "Benefit detail"},
    placeholders: {integrationProblem: "Your tools do not talk", connectionLabel: "Connect them in minutes", benefit: "One workflow, no copy and paste", benefitDetail: "Syncs every 5 minutes", cta: "Connect your tools"},
    hints: {connectionLabel: "Shows as the tiles move into place.", benefitDetail: "Shows beside the finished object."},
    steps: [
      {key: "pieces", title: "The pieces", intro: "Four tiles, one for each tool you connect. Use logos or icons on a plain background.", groups: [
        {frames: ["hook", "assembly"], cards: [card("tile1"), card("tile2"), card("tile3"), card("tile4")], fields: ["integrationProblem", "connectionLabel"]}]},
      {key: "benefit", title: "The benefit", intro: "The finished object pulses once. Then a short benefit sits beside it.", groups: [
        {frames: ["resolve", "explain"], fields: ["benefit", "benefitDetail"]}]}
    ],
    ending: "The finished object holds with the next step.",
    exampleUrl: "https://zapier.com"
  },
  "hero-artwork-becomes-a-type-stage": {
    labels: {heroArt: "Hero artwork", secondaryArt: "Background artwork", optionalShortHook: "Opening line"},
    placeholders: {optionalShortHook: "New season", headline: "Sound you can see", offerOrBenefit: "Pre-order now, ships in May", cta: "Pre-order"},
    hints: {secondaryArt: "A related, calmer image. It stays as the stage for your message.", optionalShortHook: "Short. The artwork does most of the work."},
    steps: [
      {key: "artwork", title: "Artwork", intro: "Your hero artwork fills the screen, then moves away and leaves a quiet stage.", groups: [
        {frames: ["art_hook", "transform"], fields: ["heroArt", "secondaryArt", "optionalShortHook"]}]},
      {key: "message", title: "Message and offer", intro: "One headline on the quiet stage, then a small offer.", groups: [
        {frames: ["message", "offer"], fields: ["headline", "offerOrBenefit"]}]}
    ],
    ending: "Your brand and the call to action, with a small art motif.",
    exampleUrl: "https://teenage.engineering/products/op-1"
  },
  "fixed-glyph-changing-world": {
    labels: {label12: "Label for worlds 1 and 2", label34: "Label for worlds 3 and 4"},
    placeholders: {premise: "One idea, many worlds.", promise: "Keep the idea in focus.", label12: "A different perspective.", label34: "More ways to create.", cta: "Make your next idea real"},
    hints: {glyph: "One icon or symbol, ideally on a transparent background.", premise: "Shows with the glyph at the start.", promise: "Shows when the worlds clear.", ...Object.fromEntries([1, 2, 3, 4].map(n => [`world${n}`, "Optional. Leave it empty and pick an image model to generate it."]))},
    steps: [
      {key: "anchor", title: "Anchor", intro: "The one icon that stays in the center of every scene, and the two lines it stands for.", groups: [
        {frames: ["anchor", "promise"], fields: ["glyph", "premise", "promise"]}]},
      {key: "worlds", title: "Worlds", intro: "Four scenes that appear behind the anchor, one at a time. Each pair shares one label. Leave a scene empty to generate it.", groups: [
        {frames: ["worlds_1"], cards: [card("world1"), card("world2")], fields: ["label12"]},
        {frames: ["worlds_2"], cards: [card("world3"), card("world4")], fields: ["label34"]}]}
    ],
    ending: "The last frame: the anchor joins your logo and the call to action.",
    exampleUrl: "https://www.figma.com"
  },
  "calm-breathing-shape-loop": {
    labels: {expandPrompt: "Breathe in line", contractPrompt: "Breathe out line"},
    placeholders: {invitation: "Take a breath with us", expandPrompt: "Breathe in", contractPrompt: "And let it go", benefit: "Two minutes of calm, any time", cta: "Try a session"},
    hints: {calmShape: "A soft, simple form on a transparent background.", benefit: "A product benefit, not a health promise."},
    steps: [
      {key: "shape", title: "Shape and words", intro: "One simple shape breathes in the center. Four short lines guide the viewer.", groups: [
        {frames: ["invitation"], fields: ["calmShape", "invitation"]},
        {frames: ["expand", "contract"], fields: ["expandPrompt", "contractPrompt"]},
        {frames: ["benefit"], fields: ["benefit"]}]}
    ],
    ending: "Your brand, the invitation and the next step hold.",
    exampleUrl: "https://www.headspace.com"
  },
  "macro-feature-proof": {
    labels: {macroDetail: "Close-up", featureName: "Feature name", featureAction: "What it does", qualifiedBenefit: "Benefit with proof"},
    placeholders: {featureName: "Sapphire glass", featureAction: "Shrugs off scratches", benefit: "Looks new for years", qualifiedBenefit: "Tested against 10,000 scratches", cta: "Shop now"},
    hints: {macroDetail: "A sharp macro shot of the feature.", featureAction: "Shows while the feature works.", qualifiedBenefit: "Up to 16 words. Keep any required qualification."},
    steps: [
      {key: "detail", title: "The detail", intro: "A close-up of one feature fills the screen.", groups: [
        {frames: ["macro_hook", "demonstration"], fields: ["macroDetail", "featureName", "featureAction"]}]},
      {key: "product", title: "The full product", intro: "Pull back to show the whole product, with the benefit.", groups: [
        {frames: ["context", "proof"], fields: ["fullProduct", "benefit", "qualifiedBenefit"]}]}
    ],
    ending: "Product, brand and call to action hold together.",
    exampleUrl: "https://fellowproducts.com"
  },
  "result-seen-through-the-product": {
    labels: {resultLabel: "Result line", productLink: "Product line", featureAction: "Feature line"},
    placeholders: {resultLabel: "Made in 5 minutes", productLink: "All in one app", featureAction: "Drag, drop, done", benefit: "Pro results without the learning curve", cta: "Try it free"},
    hints: {resultImage: "The best thing your product made, at full quality.", productFrame: "A screenshot of your app window, ideally with an empty content area."},
    steps: [
      {key: "result", title: "The result", intro: "The impressive output fills the screen first.", groups: [
        {frames: ["result_hook"], fields: ["resultImage", "resultLabel"]}]},
      {key: "product", title: "The product frame", intro: "Your product window appears around the result and shows how it was made.", groups: [
        {frames: ["frame_reveal"], fields: ["productFrame", "productLink"]},
        {frames: ["demonstrate", "benefit"], fields: ["featureAction", "benefit"]}]}
    ],
    ending: "Result, product and the next step stay on screen.",
    exampleUrl: "https://www.framer.com"
  },
  "a-capability-journey-on-connected-paths": {
    labels: {outcomeHook: "Outcome", stage1: "Line 1", stage2: "Line 2", stage3: "Line 3", outcomeAndCta: "Outcome and call to action"},
    placeholders: {outcomeHook: "From idea to launch in a week", stage1: "Plan in one place", stage2: "Build together", stage3: "Ship with one click", outcomeAndCta: "Launch faster. Start today"},
    hints: {outcomeHook: "Shows with the first stage at the start.", stage1: "Shows as the path reaches stage 2.", stage2: "Shows as stage 3 becomes active.", stage3: "Shows as the path reaches stage 4."},
    steps: [
      {key: "outcome", title: "Outcome", intro: "The first stage and the outcome you promise appear together.", groups: [
        {frames: ["hook"], fields: ["outcomeHook"]}]},
      {key: "stages", title: "Four stages", intro: "A path connects four icons, one stage at a time. Use icons on a plain or transparent background.", groups: [
        {frames: ["stage_1", "stage_3"], cards: [card("stageIcon1"), card("stageIcon2"), card("stageIcon3"), card("stageIcon4")], fields: ["stage1", "stage2", "stage3"]}]}
    ],
    ending: "The whole path stays on screen with the outcome and the next step.",
    exampleUrl: "https://linear.app"
  }
};
