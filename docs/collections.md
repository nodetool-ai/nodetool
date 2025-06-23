---
layout: default
title: Collections
---

Collections let you group related documents into searchable databases. Each collection has its own vector index so you can retrieve information based on semantic similarity.

### Opening the collections panel

- Click the **database icon** in the left toolbar or press **Key&nbsp;4** to open the Collections view.
- Existing collections appear in a list showing the number of indexed items and the embedding model used.
- Use the **Create Collection** button to make a new one.

### Creating a collection

1. Enter a unique name.
2. Choose an **embedding model** from the list. This model converts your documents into vectors for similarity search.
3. Submit the form. The new collection appears in the list.

### Indexing files

- Drag and drop files onto a collection to add them. A progress bar shows indexing status and an ETA.
- Supported formats include PDF, PowerPoint, Word, Excel, text, Markdown, HTML and images (with OCR extraction).
- Any errors during indexing are reported once processing finishes.

### Managing collections

- Click a collection’s workflow name to assign an ingestion workflow. This workflow runs on new files as they are indexed.
- Use the delete icon to remove a collection. Confirmation is required.

### Using collections in chat

When composing messages, click the **Collections** button in the chat toolbar to select which collections should be searched. The assistant will include results from the selected collections when responding.

Collections are stored locally, giving you full control of your data while enabling powerful document retrieval.
