# Anthropic provider

Install `@nodetool-ai/provider-anthropic` alongside the minimal server to add
text generation through the official Anthropic SDK. The minimal server does
not depend on this package.

For the executable, set
`NODETOOL_FEATURES=provider-anthropic=@nodetool-ai/provider-anthropic` and store
`ANTHROPIC_API_KEY` through the authenticated secrets route. The default feature
resolves the credential for the tenant running the workflow.

Configure the feature explicitly in the administrator's composition:

```ts
import { AnthropicTextProvider, createAnthropicFeature } from "@nodetool-ai/provider-anthropic";

const features = [{
  id: "provider-anthropic",
  load: async () => createAnthropicFeature(new AnthropicTextProvider({
    apiKey: process.env.ANTHROPIC_API_KEY ?? ""
  }))
}];
```

Pass `features` to `createMinimalServer`. The feature registers
`anthropic.text.ChatComplete` and advertises `provider:anthropic`. A provider
factory can resolve a different credential for each authenticated tenant.
