---
layout: default
title: Dashboard
---
# NodeTool Tasks

Plans and tasks for developing NodeTool. One file per plan, one file per task,
zero shared index files — designed so humans and agents can work in parallel
without merge conflicts. See [SCHEMA](https://github.com/nodetool-ai/nodetool/blob/main/.tasks/SCHEMA.md)
and [AGENTS](https://github.com/nodetool-ai/nodetool/blob/main/.tasks/AGENTS.md).

{% assign all_tasks = site.tasks | sort: "id" %}
{% assign todo = all_tasks | where: "state", "todo" %}
{% assign in_progress = all_tasks | where: "state", "in_progress" %}
{% assign review = all_tasks | where: "state", "review" %}
{% assign blocked = all_tasks | where: "state", "blocked" %}
{% assign done = all_tasks | where: "state", "done" %}
{% assign cancelled = all_tasks | where: "state", "cancelled" %}

<div class="kanban">
  <div class="kanban-col">
    <h2>Todo <span class="count">{{ todo.size }}</span></h2>
    {% for t in todo %}{% include task-card.html t=t %}{% endfor %}
  </div>
  <div class="kanban-col">
    <h2>In progress <span class="count">{{ in_progress.size }}</span></h2>
    {% for t in in_progress %}{% include task-card.html t=t %}{% endfor %}
  </div>
  <div class="kanban-col">
    <h2>Review <span class="count">{{ review.size }}</span></h2>
    {% for t in review %}{% include task-card.html t=t %}{% endfor %}
  </div>
  <div class="kanban-col">
    <h2>Blocked <span class="count">{{ blocked.size }}</span></h2>
    {% for t in blocked %}{% include task-card.html t=t %}{% endfor %}
  </div>
  <div class="kanban-col">
    <h2>Done <span class="count">{{ done.size }}</span></h2>
    {% for t in done %}{% include task-card.html t=t %}{% endfor %}
  </div>
</div>

## Active plans

{% assign active_plans = site.plans | where: "state", "accepted" | sort: "id" %}
{% if active_plans.size == 0 %}
_No accepted plans._
{% else %}
<table class="plans-table">
  <thead><tr><th>ID</th><th>Title</th><th>Owner</th><th>Progress</th></tr></thead>
  <tbody>
    {% for p in active_plans %}
      {% assign p_tasks = site.tasks | where: "plan", p.id %}
      {% assign p_total = p_tasks.size %}
      {% assign p_done = p_tasks | where: "state", "done" | size %}
      {% assign p_pct = 0 %}
      {% if p_total > 0 %}{% assign p_pct = p_done | times: 100 | divided_by: p_total %}{% endif %}
      <tr>
        <td><code>{{ p.id }}</code></td>
        <td><a href="{{ p.url | relative_url }}">{{ p.title }}</a></td>
        <td>{{ p.owner | default: "—" }}</td>
        <td>{{ p_done }} / {{ p_total }} ({{ p_pct }}%)</td>
      </tr>
    {% endfor %}
  </tbody>
</table>
{% endif %}

## All plans

{% assign all_plans = site.plans | sort: "id" %}
<ul>
  {% for p in all_plans %}
    <li>
      <code>{{ p.id }}</code> &mdash; <a href="{{ p.url | relative_url }}">{{ p.title }}</a>
      <span class="state state-{{ p.state }}">{{ p.state }}</span>
    </li>
  {% endfor %}
</ul>
