---
layout: page
title: "Fetch Papers"
---

## Overview

This workflow automatically fetches and downloads research papers from the Awesome Transformers GitHub repository. It extracts paper links from the README.md file, filters for actual papers, and downloads them to a specified folder. Ideal for researchers and AI enthusiasts who want to stay updated with the latest transformer model papers.

This workflow automatically fetches and downloads research papers from the Awesome Transformers GitHub repository. The process follows these steps:

1. **Fetch the README.md** from the GitHub repository

2. **Extract all links** with their titles from the markdown

3. **Convert the extracted links** to a DataFrame for processing

4. **Filter the DataFrame** to keep only entries with title 'Paper'

5. **Extract the URL column** from the filtered DataFrame

6. **Preview the URLs** before downloading

7. **Download all papers** to the specified folder

## Tags

automation

## Workflow Diagram

{% mermaid %}
graph TD
  fromlist_5["FromList"]
  filter_6["Filter"]
  extractcolumn_25["ExtractColumn"]
  extractlinks_32["ExtractLinks"]
  downloadfiles_21698c["DownloadFiles"]
  getrequest_422102["GetRequest"]
  fromlist_5 --> filter_6
  extractlinks_32 --> fromlist_5
  filter_6 --> extractcolumn_25
  extractcolumn_25 --> downloadfiles_21698c
  getrequest_422102 --> extractlinks_32
{% endmermaid %}

## How to Use

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
