/**
 * Tests for MessageContentRenderer component
 */

import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { render, screen, act } from '@testing-library/react-native';
import { MessageContentRenderer } from './MessageContentRenderer';
import { MessageContent } from '../../types/ApiTypes';

jest.mock("../../trpc/client", () => ({
  // Media widgets resolve an `asset://` locator through `assets.get`; these
  // cases render non-asset sources, so the lookup never settles.
  trpc: {
    assets: { get: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    useQueries: () => [],
  },
}));

/** The content box MessageView's bubble gives a message at a given window width. */
const bubbleContentWidth = (windowWidth: number) => (windowWidth - 28) * 0.85 - 28;

const setWindowWidth = (width: number) => {
  const metrics = { width, height: 800, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics } as never);
};

describe('MessageContentRenderer', () => {
  const mockRenderTextContent = jest.fn((text: string, index: number) => {
    const { Text } = require('react-native');
    return <Text key={index} testID="rendered-text">{text}</Text>;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Text content', () => {
    it('renders text content using renderTextContent callback', () => {
      const textContent: MessageContent = {
        type: 'text',
        text: 'Hello, world!',
      };

      render(
        <MessageContentRenderer
          content={textContent}
          renderTextContent={mockRenderTextContent}
          index={0}
        />
      );

      expect(mockRenderTextContent).toHaveBeenCalledWith('Hello, world!', 0);
      expect(screen.getByTestId('rendered-text')).toBeTruthy();
      expect(screen.getByText('Hello, world!')).toBeTruthy();
    });

    it('handles empty text content', () => {
      const emptyContent: MessageContent = {
        type: 'text',
        text: '',
      };

      render(
        <MessageContentRenderer
          content={emptyContent}
          renderTextContent={mockRenderTextContent}
          index={0}
        />
      );

      expect(mockRenderTextContent).toHaveBeenCalledWith('', 0);
    });

    it('handles undefined text content', () => {
      const undefinedContent = {
        type: 'text',
        text: undefined,
      } as unknown as MessageContent;

      render(
        <MessageContentRenderer
          content={undefinedContent}
          renderTextContent={mockRenderTextContent}
          index={0}
        />
      );

      expect(mockRenderTextContent).toHaveBeenCalledWith('', 0);
    });
  });

  describe('Image content', () => {
    it('renders image with valid URI', () => {
      const imageContent: MessageContent = {
        type: 'image_url',
        image: {
          type: 'image',
          uri: 'https://example.com/image.png',
        },
      };

      const { UNSAFE_root } = render(
        <MessageContentRenderer
          content={imageContent}
          renderTextContent={mockRenderTextContent}
          index={0}
        />
      );

      expect(UNSAFE_root).toBeTruthy();
      // renderTextContent should not be called for images
      expect(mockRenderTextContent).not.toHaveBeenCalled();
    });

    it('keeps the image inside the bubble content box on a narrow phone', () => {
      const original = Dimensions.get('window');
      setWindowWidth(320);
      const imageContent: MessageContent = {
        type: 'image_url',
        image: { type: 'image', uri: 'https://example.com/image.png' },
      };

      render(
        <MessageContentRenderer
          content={imageContent}
          renderTextContent={mockRenderTextContent}
          index={0}
        />
      );

      const styleAt320 = StyleSheet.flatten(screen.getByLabelText('Image content').props.style);
      expect(styleAt320.width).toBeLessThanOrEqual(bubbleContentWidth(320));
      // Height follows the media's ratio instead of a fixed 200pt letterbox.
      const ratio = (styleAt320.width as number) / (styleAt320.height as number);
      expect(ratio).toBeCloseTo(4 / 3);
      expect(styleAt320.height as number).toBeLessThanOrEqual(360);

      // A width change (rotation, split view) is picked up without a re-mount —
      // the old module-level Dimensions.get value never was.
      act(() => setWindowWidth(720));

      const styleAt720 = StyleSheet.flatten(screen.getByLabelText('Image content').props.style);
      expect(styleAt720.width).toBeGreaterThan(styleAt320.width as number);
      expect(styleAt720.width).toBeLessThanOrEqual(bubbleContentWidth(720));

      act(() => setWindowWidth(original.width));
    });

    it('shows error message when image URI is missing', () => {
      const noUriContent: MessageContent = {
        type: 'image_url',
        image: {
          type: 'image',
          uri: '',
        },
      };

      render(
        <MessageContentRenderer
          content={noUriContent}
          renderTextContent={mockRenderTextContent}
          index={0}
        />
      );

      expect(screen.getByText('Unable to load image')).toBeTruthy();
    });

    it('shows error message when image object is undefined', () => {
      const noImageContent = {
        type: 'image_url',
      } as MessageContent;

      render(
        <MessageContentRenderer
          content={noImageContent}
          renderTextContent={mockRenderTextContent}
          index={0}
        />
      );

      expect(screen.getByText('Unable to load image')).toBeTruthy();
    });
  });

  describe('Audio content', () => {
    it('renders audio player with valid URI', () => {
      const audioContent: MessageContent = {
        type: 'audio',
        audio: {
          type: 'audio',
          uri: 'https://example.com/audio.mp3',
        },
      };

      const { UNSAFE_root } = render(
        <MessageContentRenderer
          content={audioContent}
          renderTextContent={mockRenderTextContent}
          index={0}
        />
      );

      expect(UNSAFE_root).toBeTruthy();
      expect(mockRenderTextContent).not.toHaveBeenCalled();
    });

    it('shows error message when audio URI is missing', () => {
      const noUriContent: MessageContent = {
        type: 'audio',
        audio: {
          type: 'audio',
          uri: '',
        },
      };

      render(
        <MessageContentRenderer
          content={noUriContent}
          renderTextContent={mockRenderTextContent}
          index={0}
        />
      );

      expect(screen.getByText('Unable to load audio')).toBeTruthy();
    });
  });

  describe('Video content', () => {
    it('renders video player with valid URI', () => {
      const videoContent: MessageContent = {
        type: 'video',
        video: {
          type: 'video',
          uri: 'https://example.com/video.mp4',
        },
      };

      const { UNSAFE_root } = render(
        <MessageContentRenderer
          content={videoContent}
          renderTextContent={mockRenderTextContent}
          index={0}
        />
      );

      expect(UNSAFE_root).toBeTruthy();
      expect(mockRenderTextContent).not.toHaveBeenCalled();
    });

    it('shows error message when video URI is missing', () => {
      const noUriContent: MessageContent = {
        type: 'video',
        video: {
          type: 'video',
          uri: '',
        },
      };

      render(
        <MessageContentRenderer
          content={noUriContent}
          renderTextContent={mockRenderTextContent}
          index={0}
        />
      );

      expect(screen.getByText('Unable to load video')).toBeTruthy();
    });
  });

  describe('Document content', () => {
    it('renders document placeholder', () => {
      const documentContent: MessageContent = {
        type: 'document',
        document: {
          type: 'document',
          uri: 'https://example.com/doc.pdf',
        },
      };

      render(
        <MessageContentRenderer
          content={documentContent}
          renderTextContent={mockRenderTextContent}
          index={0}
        />
      );

      expect(screen.getByText('📄 Document attached')).toBeTruthy();
    });
  });

  describe('Unknown content type', () => {
    it('returns null for unknown content type', () => {
      const unknownContent = {
        type: 'unknown_type',
      } as unknown as MessageContent;

      const { toJSON } = render(
        <MessageContentRenderer
          content={unknownContent}
          renderTextContent={mockRenderTextContent}
          index={0}
        />
      );

      expect(toJSON()).toBeNull();
    });
  });

  describe('Index prop', () => {
    it('passes correct index to renderTextContent', () => {
      const textContent: MessageContent = {
        type: 'text',
        text: 'Test message',
      };

      render(
        <MessageContentRenderer
          content={textContent}
          renderTextContent={mockRenderTextContent}
          index={5}
        />
      );

      expect(mockRenderTextContent).toHaveBeenCalledWith('Test message', 5);
    });
  });
});
