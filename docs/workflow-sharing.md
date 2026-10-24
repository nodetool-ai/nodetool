---
layout: page
title: "Sharing Workflows and Documents"
permalink: /workflow-sharing
description: "Share a workflow or document with collaborators through view, edit, or public links, and manage who has access."
---

You share a workflow by creating a link and sending it to someone. Storyboards, scripts, timelines, sketches, apps and JS scripts share the same way. See [Other documents](#other-documents) for how they differ. The link carries a permission level. When the other person opens it, they get that level of access to your workflow. Only the owner of a workflow can create links or change who has access.

Sharing depends on user accounts, so it matters which [authentication mode](authentication.md) your server runs in.

## Which deployments support sharing

| Mode | Sharing |
|------|---------|
| Supabase mode (`SUPABASE_URL` and `SUPABASE_KEY` set) | Works. Each person signs in with their own account, and a link gives that account access. |
| Local mode, one person on loopback | Not useful. Loopback connections all run as the same user (`"1"`), so you are always the owner of your own links. |

Opening a share link requires being signed in to the server. The one exception is a public link, which anyone can open to view the workflow without an account. See [Authentication](authentication.md) and [Supabase Deployment](supabase-deployment.md) for setting up accounts.

## Permission levels

There are three kinds of link.

| Link | Who can open it | What it grants |
|------|-----------------|----------------|
| **Can view** | Anyone signed in to the server | Viewer access to the workflow |
| **Can edit** | Anyone signed in to the server | Editor access to the workflow, including version history |
| **Public view** | Anyone, without an account | A read-only page showing the workflow. Grants no access to your account or workflows |

A viewer can open the workflow. An editor can also save changes and see its version history. Only the owner can open the share dialog, create or revoke links, change roles, and remove people.

## Create a link

1. Open the workflow in the editor and choose **Share Workflow…** from the command menu, or click the share button on the workflow's row in the **Documents** panel.
2. In the **Share "workflow name"** dialog, click **Copy view link**, **Copy edit link**, or **Copy public link**.

The link is copied to your clipboard. If the browser blocks clipboard access, NodeTool tells you the link was created, and you can copy it from the **Active links** list in the dialog.

Each role has one active link per workflow. Clicking the same button again returns the existing link instead of making a new one.

The links look like this:

| Link type | Path |
|-----------|------|
| Can view, Can edit | `/share/<token>` |
| Public view | `/view/<token>` |

## Revoke a link

Every active link appears under **Active links** with a role label, a copy button, and **Revoke**.

Revoking a link stops anyone from using it again. For a view or edit link, people who already joined keep their access and stay listed under **People with access**. To take their access away, remove them as described below. For a public link, revoking stops the public page and copying.

## People with access

After someone opens a view or edit link, they appear under **People with access**. Each row shows their user ID, a role selector, and a remove button.

- Change the selector between **Can view** and **Can edit** to change their role.
- Click the remove button (tooltip **Remove access**) to take their access away.

Until someone redeems a link, the list shows **No collaborators yet**. If you open your own link, nothing changes, because you are already the owner.

A collaborator can also remove themselves from a workflow they were given access to.

## Accept a share link

Opening a view or edit link takes you to a page that says "Opening shared workflow…". NodeTool adds you as a collaborator with the link's role and sends you to the workflow in the editor.

If the link is invalid or revoked, you see "This share link is invalid or has been revoked. Ask the workflow owner for a new one." with a **Go to editor** button. Public links cannot be accepted this way, since they do not grant access.

## Public links

A public link opens a read-only page showing the workflow's graph, name, and description. It needs no account and shows nothing about the owner. A signed-in visitor sees **Duplicate to my workflows**, which copies the workflow into their own account as a new private workflow. A visitor who is not signed in sees **Sign in to duplicate**. The original stays unchanged.

If the link has been revoked, the page shows "This workflow is not available".

## Other documents

Storyboards, scripts, timelines, sketches, apps and JS scripts use the same view and edit links and the same **People with access** list. Open the share dialog from the share button on the document's row in the **Documents** panel, or from **Share…** in the row's right-click menu.

These differences apply:

- There is no public link.
- A link has the path `/share/document/<token>`. Opening it adds you as a collaborator and opens the document in the workspace, read-only for a viewer.
- A viewer can open the document and its version history. An editor can also save changes, create versions and restore them. Only the owner can delete the document, delete versions, publish an app, or manage its budget and deployment.
- A collaborator can open the owner's images, video and audio that the document refers to directly, and nothing else in the owner's library.

Deleting a document removes its links and everyone's access.

## Shared with me

The **Documents** panel ends with a **Shared with me** group listing every workflow and document shared with your account, with your role on each. Click a row to open it. Documents whose owner deleted them are left out. The API serves the same lists as `workflows.sharing.sharedWithMe` and `documentSharing.sharedWithMe`.

## Related

- [Workflow Editor](workflow-editor.md)
- [Authentication](authentication.md)
