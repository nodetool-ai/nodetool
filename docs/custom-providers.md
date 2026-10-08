---
layout: page
title: "Custom Providers"
permalink: /custom-providers
description: "Add any OpenAI-compatible endpoint, such as a proxy, gateway or self-hosted router, as a NodeTool provider."
---

A custom provider is an endpoint that speaks the OpenAI API, added by URL instead of by code. Use it for a proxy, a gateway, a self-hosted router, or any vendor that NodeTool has no built-in provider for. Its chat, image and video models then appear in the matching model pickers. For the built-in providers see [Providers](providers.md).

## Add an endpoint

1. Open **Settings** and go to **Models & providers**.
2. Scroll to **OpenAI-compatible endpoints** and click **Add endpoint**.
3. Fill in the dialog and click **Add**.

| Field | Required | What it does |
|---|---|---|
| Name | No | Display name shown in the model menu and settings. Defaults to the slug |
| Slug | Yes | Unique id for this endpoint. Starts with a lowercase letter, then lowercase letters, digits or underscores, 1 to 32 characters. It follows the name as you type, and you can edit it before saving |
| Base URL | Yes | The endpoint address, `http` or `https`, including the version path it serves, usually `/v1`. Trailing slashes are removed |
| API key | No | Sent to the endpoint. Leave it empty for endpoints that accept anonymous requests, such as a local router |
| Models | No | Comma-separated chat model ids. Leave it empty to read `GET <base URL>/models` |
| Image models | No | Image model ids to add. Calls go to `/images/generations` |
| Video models | No | Video model ids to add. Calls go to `/videos` |

The provider id is `custom_<slug>`. A slug `myproxy` becomes `custom_myproxy`. That id is written into saved workflows and model references, so the slug cannot be changed after you create the endpoint.

After you save, NodeTool runs a test automatically.

## Model discovery

NodeTool finds models in this order:

1. If you typed ids into **Models**, it offers those and does not call `/models`.
2. Otherwise it sends `GET <base URL>/models`. The request times out after 5 seconds so an unreachable endpoint cannot stall the model menu.
3. It sorts each listed model into chat, image or video. It uses the endpoint's own metadata where there is any and the model id otherwise.
4. Ids you entered under **Image models** and **Video models** are always offered in those pickers, on top of what the listing detects.

A model with only an image-like or video-like id stays in the chat list, because the id alone is a guess and hiding a chat model would leave no way to pick it.

Tool calling is not detected. Every chat model is offered with tools, and a model that does not support them fails at call time with the endpoint's own error.

The provider declares no image sizes or video durations. The node's own size options apply and are passed to the endpoint as given.

## Test an endpoint

Click **Test** on an endpoint's card. The server requests the model list and reports how many models landed in each picker, for example "12 chat models, 3 image models and 1 video model available." The card shows **Chat**, **Image** and **Video** counts.

The test passes when it finds at least one model. If the endpoint answers with no models, the card says to enter model ids by hand, which is what to do for an endpoint with no `/models` route. If the request fails, the card shows the error. If an image or video model is missing from the counts, edit the endpoint and add its id to the matching field.

## API key handling

The base URL and the API key are stored as encrypted secrets under your account. The card shows a **Key set** chip when a key exists and never shows the key itself.

On a server you can skip the UI and set both values as environment variables. For slug `myproxy`:

```bash
CUSTOM_MYPROXY_BASE_URL=https://proxy.example.com/v1
CUSTOM_MYPROXY_API_KEY=sk-...
```

The variable names are `CUSTOM_<SLUG>_BASE_URL` and `CUSTOM_<SLUG>_API_KEY` with the slug in upper case. A stored value takes precedence over the environment variable. The endpoint's name and model lists still live in the settings catalog, so the environment variables replace only the URL and key.

A provider with no base URL counts as unconfigured and its models do not appear.

## Edit an endpoint

Click **Edit** on the card. All fields except the slug can change. The API key field starts empty with the hint "Leave blank to keep the stored key". Leaving it blank keeps the stored key. The dialog has no control to clear a stored key. Remove the endpoint and add it again to drop the key.

## Remove an endpoint

Click **Remove** and confirm. NodeTool deletes the catalog entry and both secrets. Workflows that reference its models stop resolving, so switch their nodes to another model first.

## Where the models appear

Chat, image and video models appear in the matching model pickers, listed under the endpoint's name. The CLI loads the same endpoints for the default local user, so they work from `nodetool` commands as well. See [Providers](providers.md) for the provider list and [Configuration](configuration.md) for environment variables.
