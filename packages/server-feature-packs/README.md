# Installed node pack feature

`createInstalledPackFeature({packId,nodeTypes})` loads one explicitly installed
pack through NodeTool's existing pack loader. It never installs or enumerates
other installed packs. Only the selected, audited node types are registered.

The isolated host admits text filters, Checkerboard GPU rendering, Save Image
Asset, browser Screenshot and Transformers Text Generation. Filesystem loaders
still require an audit before admission.

For browser Screenshot, explicitly install the `automation` pack and configure
`openBrowser: isolatedBrowserService(browser)` with the public
`@nodetool-ai/browser` module. The adapter launches a fresh browser, accepts no
workflow-selected shared profile or debugging port, and closes the session on
cancellation and completion.

For Transformers Text Generation, explicitly install the `transformers-js` pack
and its runtime. Configure `openLocalGeneration:
localTransformersService(transformers, {small: "/approved/models/small"})` with
the installed `@huggingface/transformers` module. Workflow model IDs must match
the configured allowlist. The helper uses local files only, interrupts generation
on cancellation and disposes the pipeline. Neither helper imports or installs
these optional modules. Supply them explicitly in your server composition.

Both adapters receive the same owner-scoped context as the other pack nodes.
Missing services fail with `FEATURE_NOT_CONFIGURED` and recovery instructions.
The pipeline initializer receives only approved model paths. Custom service
implementations must honor the context cancellation signal during initialization
and preserve owner isolation.

Each run gets an actual ProcessingContext with its own workspace, owner-scoped
secrets and byte assets. Global model interfaces, process environment defaults
and unconfigured providers are blocked. Missing optional persistence operations
return a configuration error.

For CLI configuration, select `@nodetool-ai/server-feature-packs/text` or
`@nodetool-ai/server-feature-packs/image` after explicitly installing the
corresponding text-nodes or image-nodes package. These exports declare the
existing `text` and `image` feature IDs and retain missing-node diagnostics for
other nodes in those packs.

The advertised capabilities are `browser:screenshot` and
`local-inference:text-generation`, in addition to the pack's node capability.
These names describe the enabled operations. They do not advertise shared-tab
control or other local inference tasks.

Transformers.js pipeline initialization exposes neither an abort signal nor a
pipeline handle before its promise settles. An abort during initialization waits
for that promise, disposes the resulting pipeline, then reports `AbortError`.
The host does not return early and leave an untracked background initializer.
Generation uses the runtime's interrupt hook. Browser launch has the same
settlement requirement before its session handle becomes available. After
launch, cancellation closes the isolated session, including during page setup.

Remote Screenshot inputs follow the authenticated screenshot policy: the initial
URL must use public HTTPS, without embedded credentials. File URLs, loopback,
private and metadata IP literals are refused before a browser is launched.
