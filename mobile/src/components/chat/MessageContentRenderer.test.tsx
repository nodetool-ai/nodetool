/**
 * Tests for MessageContentRenderer component
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MessageContentRenderer } from './MessageContentRenderer';
import { MessageContent } from '../../types/ApiTypes';

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
      } as MessageContent;

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
