/**
 * Tests for useExecutionTreeState — focuses on the pure reducer
 * (buildExecutionTreeState) so we don't need a React renderer.
 */

import { buildExecutionTreeState } from './useExecutionTreeState';
import type { Message } from '../types/ApiTypes';

function agentMessage(
  execution_event_type: string,
  content: unknown
): Message {
  return {
    type: 'message',
    role: 'agent_execution',
    agent_execution_id: 'exec-1',
    execution_event_type,
    content: content as Message['content'],
  } as Message;
}

describe('buildExecutionTreeState', () => {
  it('returns idle state when there are no agent_execution messages', () => {
    const state = buildExecutionTreeState([
      { type: 'message', role: 'user', content: 'Hello' } as Message,
    ]);
    expect(state.phase).toBe('idle');
    expect(state.tasks).toEqual([]);
    expect(state.planningLog).toEqual([]);
  });

  it('captures planning_update entries in order', () => {
    const state = buildExecutionTreeState([
      agentMessage('planning_update', {
        type: 'planning_update',
        phase: 'initialization',
        status: 'started',
        content: 'Bootstrapping plan',
      }),
      agentMessage('planning_update', {
        type: 'planning_update',
        phase: 'generation',
        status: 'in_progress',
        content: 'Generating steps',
      }),
    ]);

    expect(state.phase).toBe('planning');
    expect(state.planningLog).toHaveLength(2);
    expect(state.planningLog[0].phase).toBe('initialization');
    expect(state.planningLog[1].phase).toBe('generation');
    // planningContent reflects the last non-empty content
    expect(state.planningContent).toBe('Generating steps');
  });

  it('creates tasks and steps from task_update events', () => {
    const messages: Message[] = [
      agentMessage('task_update', {
        type: 'task_update',
        event: 'task_created',
        task: {
          id: 'task-1',
          title: 'Research topic',
          steps: [
            { id: 'step-a', instructions: 'Search the web' },
            { id: 'step-b', instructions: 'Summarize findings' },
          ],
        },
      }),
      agentMessage('task_update', {
        type: 'task_update',
        event: 'step_started',
        task: { id: 'task-1' },
        step: { id: 'step-a', instructions: 'Search the web' },
      }),
    ];

    const state = buildExecutionTreeState(messages);
    expect(state.phase).toBe('executing');
    expect(state.tasks).toHaveLength(1);
    const task = state.tasks[0];
    expect(task.id).toBe('task-1');
    expect(task.name).toBe('Research topic');
    expect(task.steps).toHaveLength(2);
    expect(task.steps[0].status).toBe('running');
    expect(task.steps[1].status).toBe('waiting');
  });

  it('marks steps as completed/failed from step_completed / step_failed events', () => {
    const messages: Message[] = [
      agentMessage('task_update', {
        type: 'task_update',
        event: 'task_created',
        task: {
          id: 'task-1',
          title: 'Research topic',
          steps: [
            { id: 'step-a', instructions: 'Search' },
            { id: 'step-b', instructions: 'Analyze' },
          ],
        },
      }),
      agentMessage('task_update', {
        type: 'task_update',
        event: 'step_started',
        task: { id: 'task-1' },
        step: { id: 'step-a' },
      }),
      agentMessage('task_update', {
        type: 'task_update',
        event: 'step_completed',
        task: { id: 'task-1' },
        step: { id: 'step-a' },
      }),
      agentMessage('task_update', {
        type: 'task_update',
        event: 'step_started',
        task: { id: 'task-1' },
        step: { id: 'step-b' },
      }),
      agentMessage('task_update', {
        type: 'task_update',
        event: 'step_failed',
        task: { id: 'task-1' },
        step: { id: 'step-b' },
      }),
    ];

    const state = buildExecutionTreeState(messages);
    const task = state.tasks[0];
    expect(task.steps[0].status).toBe('completed');
    expect(task.steps[1].status).toBe('failed');
  });

  it('marks phase as done when all tasks are completed', () => {
    const messages: Message[] = [
      agentMessage('task_update', {
        type: 'task_update',
        event: 'task_created',
        task: { id: 'task-1', title: 'A', steps: [{ id: 's1' }] },
      }),
      agentMessage('task_update', {
        type: 'task_update',
        event: 'task_completed',
        task: { id: 'task-1' },
      }),
    ];

    const state = buildExecutionTreeState(messages);
    expect(state.phase).toBe('done');
    expect(state.tasks[0].status).toBe('completed');
    expect(state.tasks[0].expanded).toBe(false);
  });

  it('annotates steps with the latest tool call from the store map', () => {
    const messages: Message[] = [
      agentMessage('task_update', {
        type: 'task_update',
        event: 'task_created',
        task: { id: 'task-1', title: 'A', steps: [{ id: 'step-a' }] },
      }),
    ];

    const state = buildExecutionTreeState(messages, {
      'step-a': [
        {
          id: 'tc-1',
          name: 'google_search',
          args: { q: 'nodetool' },
          startedAt: Date.now(),
        },
      ],
    });
    expect(state.tasks[0].steps[0].toolName).toBe('google_search');
  });
});
