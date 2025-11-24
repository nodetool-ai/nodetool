---
layout: page
title: "Google Jobs"
node_type: "search.google.GoogleJobs"
namespace: "search.google"
---

**Type:** `search.google.GoogleJobs`

**Namespace:** `search.google`

## Description

Search Google Jobs for job listings.
    google, jobs, employment, careers, serp

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| query | `str` | Job title, skills, or company name to search for | `` |
| location | `str` | Geographic location for job search | `` |
| num_results | `int` | Maximum number of job results to return | `10` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[job_result]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [search.google](../) namespace.

