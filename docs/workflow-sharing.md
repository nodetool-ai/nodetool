---
layout: page
title: "Sharing Workflows"
permalink: /workflow-sharing
description: "Share a workflow with collaborators through view, edit, or public links, and manage who has access."
---

You share a workflow by creating a link and sending it to someone. The link carries a permission level. When the other person opens it, they get that level of access to your workflow. Only the owner of a workflow can create links or change who has access.

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

1. Open the workflow in the editor.
2. Open the command menu and choose **Share Workflow…**.
3. In the **Share "workflow name"** dialog, click **Copy view link**, **Copy edit link**, or **Copy public link**.

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

## Shared with me

The server keeps a list of every workflow shared with an account, with the role on each. Workflows whose owner deleted them are left out. This list is available through the API as `workflows.sharing.sharedWithMe`. The web app does not include a "Shared with me" section in the workflow list. Open a shared workflow again from its original link.

## Related

- [Workflow Editor](workflow-editor.md)
- [Authentication](authentication.md)
