/**
 * Resource references in chat prose: a sketch or timeline draws inline with a
 * chip that opens its viewer, in every form the agent writes one, and nowhere
 * else.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

interface QueryResult {
  data?: unknown;
  isLoading: boolean;
}

const mockSketchQuery = jest.fn<QueryResult, [{ id: string }]>();
const mockTimelineQuery = jest.fn<QueryResult, [{ id: string }]>();

jest.mock('../../trpc/client', () => ({
  trpc: {
    sketch: { get: { useQuery: (input: { id: string }) => mockSketchQuery(input) } },
    timeline: { get: { useQuery: (input: { id: string }) => mockTimelineQuery(input) } },
    assets: { get: { useQuery: () => ({ isLoading: false, data: undefined }) } },
  },
}));

import { ChatMarkdown } from './ChatMarkdown';

const sketchResponse = {
  id: 'sk1',
  name: 'Lighthouse',
  document: {
    sketch: {
      canvas: { width: 200, height: 100, backgroundColor: '#ffffff' },
      layers: [{ id: 'l1', name: 'Base', type: 'raster', visible: true, opacity: 1 }],
    },
    layerBindings: [],
  },
};

const timelineResponse = {
  id: 'tl1',
  name: 'Trailer cut',
  durationMs: 9000,
  tracks: [
    { id: 't1', name: 'Video 1', type: 'video', index: 0, visible: true, locked: false },
  ],
  clips: [
    {
      id: 'c1',
      trackId: 't1',
      name: 'Opening shot',
      startMs: 0,
      durationMs: 9000,
      mediaType: 'video',
      sourceType: 'generated',
      status: 'generated',
      locked: false,
      versions: [],
    },
  ],
  markers: [],
};

/** Gives the timeline frame a width; the lanes only draw once it has one. */
const layOutTimeline = () => {
  fireEvent(screen.getByLabelText('Timeline preview: Trailer cut'), 'layout', {
    nativeEvent: { layout: { width: 320, height: 0, x: 0, y: 0 } },
  });
};

describe('ChatMarkdown resource previews', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSketchQuery.mockReturnValue({ isLoading: false, data: sketchResponse });
    mockTimelineQuery.mockReturnValue({ isLoading: false, data: timelineResponse });
  });

  it('renders a sketch preview for image syntax', () => {
    render(<ChatMarkdown content="Here it is: ![Lighthouse](sketch://sk1)" />);

    expect(mockSketchQuery).toHaveBeenCalledWith({ id: 'sk1' });
    expect(screen.getByLabelText('Sketch preview: Lighthouse')).toBeTruthy();
    expect(screen.getByLabelText('Open sketch Lighthouse')).toBeTruthy();
  });

  it('renders a timeline preview with its title and duration for a bare URI', () => {
    render(<ChatMarkdown content="I updated timeline://tl1 for you." />);

    expect(mockTimelineQuery).toHaveBeenCalledWith({ id: 'tl1' });
    layOutTimeline();
    expect(screen.getByText('Trailer cut')).toBeTruthy();
    expect(screen.getByText('0:09')).toBeTruthy();
    expect(screen.getByText('Video 1')).toBeTruthy();
    expect(screen.getByLabelText(/^Clip Opening shot, video/)).toBeTruthy();
    // The prose around the URI survives.
    expect(screen.getByText(/I updated/)).toBeTruthy();
    expect(screen.getByLabelText('Open timeline tl1')).toBeTruthy();
  });

  it('renders a preview for a URI alone in a code span', () => {
    render(<ChatMarkdown content="Open `sketch://sk1` to see it." />);

    expect(screen.getByLabelText('Sketch preview: Lighthouse')).toBeTruthy();
    expect(screen.getByLabelText('Open sketch sk1')).toBeTruthy();
  });

  it('leaves a fenced code block literal', () => {
    render(<ChatMarkdown content={'```\nsketch://sk1\n```'} />);

    expect(screen.queryByTestId('inline-resource-preview')).toBeNull();
    expect(mockSketchQuery).not.toHaveBeenCalled();
    expect(screen.getByText('sketch://sk1')).toBeTruthy();
  });

  it('leaves a code span that carries other text literal', () => {
    render(<ChatMarkdown content="Run `open sketch://sk1 now` later." />);

    expect(screen.queryByTestId('inline-resource-preview')).toBeNull();
    expect(screen.getByText('open sketch://sk1 now')).toBeTruthy();
  });

  it('shows the chip alone when the load fails', () => {
    mockSketchQuery.mockReturnValue({ isLoading: false, data: undefined });

    render(<ChatMarkdown content="![Lighthouse](sketch://sk1)" />);

    expect(screen.queryByLabelText(/^Sketch preview/)).toBeNull();
    expect(screen.getByLabelText('Open sketch Lighthouse')).toBeTruthy();
  });

  it('shows the chip alone for a kind with no preview', () => {
    render(<ChatMarkdown content="![Chase](storyboard://sb1)" />);

    expect(mockSketchQuery).not.toHaveBeenCalled();
    expect(mockTimelineQuery).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Open storyboard Chase'));
    expect(mockNavigate).toHaveBeenCalledWith('StoryboardEditor', { id: 'sb1', name: 'Chase' });
  });

  it('opens the sketch viewer from the sketch chip', () => {
    render(<ChatMarkdown content="![Lighthouse](sketch://sk1)" />);

    fireEvent.press(screen.getByLabelText('Open sketch Lighthouse'));

    expect(mockNavigate).toHaveBeenCalledWith('SketchViewer', { id: 'sk1', name: 'Lighthouse' });
  });

  it('opens the timeline viewer from the timeline chip', () => {
    render(<ChatMarkdown content="![Trailer](timeline://tl1)" />);

    fireEvent.press(screen.getByLabelText('Open timeline Trailer'));

    expect(mockNavigate).toHaveBeenCalledWith('TimelineViewer', { id: 'tl1', name: 'Trailer' });
  });

  it('says a kind mobile does not open opens on desktop or web', () => {
    render(<ChatMarkdown content="`workflow://wf1`" />);

    fireEvent.press(screen.getByLabelText('Open workflow wf1'));

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByText(/opens in the NodeTool desktop or web app/)).toBeTruthy();
  });
});
