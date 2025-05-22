import { clipboard, nativeImage } from 'electron';
import { runWorkflow } from '../workflowExecution';
import { createWorkflowRunner } from '../WorkflowRunner';
import { createWorkflowWindow } from '../workflowWindow';
import { logMessage } from '../logger';
import { Workflow } from '../types';

jest.mock('electron', () => ({
  clipboard: {
    readImage: jest.fn(),
    readText: jest.fn(),
    writeImage: jest.fn(),
    writeText: jest.fn(),
  },
  nativeImage: {
    createFromBuffer: jest.fn(),
  },
}));

jest.mock('../WorkflowRunner', () => ({
  createWorkflowRunner: jest.fn(),
}));

jest.mock('../workflowWindow', () => ({
  createWorkflowWindow: jest.fn(),
}));

jest.mock('../logger', () => ({
  logMessage: jest.fn(),
}));

const mockedCreateWorkflowRunner = createWorkflowRunner as jest.MockedFunction<typeof createWorkflowRunner>;
const mockedCreateWorkflowWindow = createWorkflowWindow as jest.MockedFunction<typeof createWorkflowWindow>;
const mockedClipboard = clipboard as jest.Mocked<typeof clipboard>;
const mockedNativeImage = nativeImage as jest.Mocked<typeof nativeImage>;

function createBaseWorkflow(runMode: 'headless' | 'normal', outputType: string): Workflow {
  return {
    id: 'wf1',
    name: 'Test Workflow',
    description: '',
    created_at: '',
    updated_at: '',
    tags: '',
    thumbnail: '',
    thumbnail_url: '',
    graph: {
      nodes: [
        { id: '1', type: 'nodetool.input.ImageInput', data: { name: 'inputImage' } },
        { id: '2', type: 'nodetool.input.StringInput', data: { name: 'inputText' } },
        { id: '3', type: outputType, data: {} },
      ],
      edges: [],
    },
    input_schema: {} as any,
    output_schema: {} as any,
    settings: { shortcut: '', run_mode: runMode },
  };
}

describe('runWorkflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('executes workflow in headless mode using clipboard params and writes image result', async () => {
    const workflow = createBaseWorkflow('headless', 'nodetool.output.ImageOutput');

    const imageBuffer = Buffer.from('imgdata');
    mockedClipboard.readImage.mockReturnValue({
      isEmpty: () => false,
      toPNG: () => imageBuffer,
    } as any);
    mockedClipboard.readText.mockReturnValue('clip text');

    const mockImage = {} as any;
    mockedNativeImage.createFromBuffer.mockReturnValue(mockImage);

    let onComplete: ((results: any[]) => void) | undefined;
    const mockConnect = jest.fn().mockResolvedValue(undefined);
    const mockRun = jest.fn(async () => {
      if (onComplete) onComplete([{ uri: 'resultdata' }]);
    });
    const state: any = { connect: mockConnect, run: mockRun, onComplete: undefined };
    const runner = {
      getState: jest.fn(() => state),
      setState: jest.fn((partial: any) => {
        if (partial.onComplete) {
          onComplete = partial.onComplete;
          state.onComplete = partial.onComplete;
        }
      }),
    } as any;
    mockedCreateWorkflowRunner.mockReturnValue(runner);

    await runWorkflow(workflow);

    const expectedUri = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    expect(mockConnect).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledWith(workflow, {
      inputImage: { type: 'image', uri: expectedUri },
      inputText: 'clip text',
    });
    expect(mockedNativeImage.createFromBuffer).toHaveBeenCalledWith(Buffer.from('resultdata', 'base64'));
    expect(mockedClipboard.writeImage).toHaveBeenCalledWith(mockImage);
    expect(mockedCreateWorkflowWindow).not.toHaveBeenCalled();
  });

  it('opens workflow window in normal mode', async () => {
    const workflow = createBaseWorkflow('normal', 'nodetool.output.StringOutput');

    await runWorkflow(workflow);

    expect(mockedCreateWorkflowWindow).toHaveBeenCalledWith(workflow.id);
    expect(mockedCreateWorkflowRunner).not.toHaveBeenCalled();
    expect(mockedClipboard.readText).not.toHaveBeenCalled();
  });
});
