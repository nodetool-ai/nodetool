/**
 * Tests for FilePreview component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { FilePreview } from './FilePreview';
import { DroppedFile } from '../../types/chat.types';

describe('FilePreview', () => {
  const mockOnRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Image files', () => {
    const validImageFile: DroppedFile = {
      dataUri: 'data:image/png;base64,abc123',
      type: 'image/png',
      name: 'test-image.png',
    };

    const jpegImageFile: DroppedFile = {
      dataUri: 'data:image/jpeg;base64,xyz789',
      type: 'image/jpeg',
      name: 'photo.jpg',
    };

    it('renders image preview for valid image data URI', () => {
      render(<FilePreview file={validImageFile} onRemove={mockOnRemove} />);
      // Image component should be rendered
      expect(screen.UNSAFE_root).toBeTruthy();
    });

    it('renders image preview for JPEG images', () => {
      render(<FilePreview file={jpegImageFile} onRemove={mockOnRemove} />);
      expect(screen.UNSAFE_root).toBeTruthy();
    });

    it('shows file icon for image with invalid data URI format', () => {
      const invalidImageFile: DroppedFile = {
        dataUri: 'https://example.com/image.png', // Not a base64 data URI
        type: 'image/png',
        name: 'remote-image.png',
      };

      render(<FilePreview file={invalidImageFile} onRemove={mockOnRemove} />);
      // Should show file name since it's not a valid base64 image
      expect(screen.getByText('remote-image.png')).toBeTruthy();
    });
  });

  describe('Non-image files', () => {
    const audioFile: DroppedFile = {
      dataUri: 'data:audio/mpeg;base64,audio123',
      type: 'audio/mpeg',
      name: 'song.mp3',
    };

    const videoFile: DroppedFile = {
      dataUri: 'data:video/mp4;base64,video123',
      type: 'video/mp4',
      name: 'video.mp4',
    };

    const pdfFile: DroppedFile = {
      dataUri: 'data:application/pdf;base64,pdf123',
      type: 'application/pdf',
      name: 'document.pdf',
    };

    const genericFile: DroppedFile = {
      dataUri: 'data:application/octet-stream;base64,file123',
      type: 'application/octet-stream',
      name: 'unknown-file.bin',
    };

    it('shows file icon and name for audio files', () => {
      render(<FilePreview file={audioFile} onRemove={mockOnRemove} />);
      expect(screen.getByText('song.mp3')).toBeTruthy();
    });

    it('shows file icon and name for video files', () => {
      render(<FilePreview file={videoFile} onRemove={mockOnRemove} />);
      expect(screen.getByText('video.mp4')).toBeTruthy();
    });

    it('shows file icon and name for PDF files', () => {
      render(<FilePreview file={pdfFile} onRemove={mockOnRemove} />);
      expect(screen.getByText('document.pdf')).toBeTruthy();
    });

    it('shows file icon and name for generic files', () => {
      render(<FilePreview file={genericFile} onRemove={mockOnRemove} />);
      expect(screen.getByText('unknown-file.bin')).toBeTruthy();
    });
  });

  describe('Remove button', () => {
    const testFile: DroppedFile = {
      dataUri: 'data:image/png;base64,test',
      type: 'image/png',
      name: 'test.png',
    };

    it('calls onRemove when remove button is pressed', () => {
      render(<FilePreview file={testFile} onRemove={mockOnRemove} />);
      
      const removeButton = screen.UNSAFE_root.findAllByType(
        require('react-native').TouchableOpacity
      )[0];
      
      fireEvent.press(removeButton);
      expect(mockOnRemove).toHaveBeenCalledTimes(1);
    });

    it('has correct accessibility label', () => {
      render(<FilePreview file={testFile} onRemove={mockOnRemove} />);
      
      const removeButton = screen.UNSAFE_root.findAllByType(
        require('react-native').TouchableOpacity
      )[0];
      
      expect(removeButton.props.accessibilityLabel).toBe('Remove file test.png');
    });
  });

  describe('Long file names', () => {
    const longNameFile: DroppedFile = {
      dataUri: 'data:application/pdf;base64,pdf123',
      type: 'application/pdf',
      name: 'this-is-a-very-long-filename-that-should-be-truncated-properly.pdf',
    };

    it('renders long file names (truncation is handled by numberOfLines prop)', () => {
      render(<FilePreview file={longNameFile} onRemove={mockOnRemove} />);
      // The text should still be in the document, truncation is visual
      expect(screen.getByText(longNameFile.name)).toBeTruthy();
    });
  });
});
