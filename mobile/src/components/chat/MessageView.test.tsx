/**
 * Tests for MessageView component
 */

import { render, screen } from '@testing-library/react-native';
import { MessageView } from './MessageView';
import { Message } from '../../types';

// Mock ChatMarkdown component to simplify testing
jest.mock("../../trpc/client", () => ({
  // Media widgets resolve an `asset://` locator through `assets.get`; these
  // cases render non-asset sources, so the lookup never settles.
  trpc: {
    assets: { get: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    useQueries: () => [],
  },
}));

jest.mock('./ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { content: string }) => {
    const { Text } = require('react-native');
    return <Text testID="chat-markdown">{content}</Text>;
  },
}));

describe('MessageView', () => {
  describe('User messages', () => {
    it('renders user message with string content', () => {
      const message: Message = {
        id: '1',
        type: 'message',
        role: 'user',
        content: 'Hello world',
      };
      
      render(<MessageView message={message} />);
      expect(screen.getByText('Hello world')).toBeTruthy();
    });

    it('renders user message with array content', () => {
      const message: Message = {
        id: '2',
        type: 'message',
        role: 'user',
        content: [{ type: 'text', text: 'Array message' }] as any,
      };
      
      render(<MessageView message={message} />);
      expect(screen.getByText('Array message')).toBeTruthy();
    });

    it('renders user message with multiple text content items', () => {
      const message: Message = {
        id: '3',
        type: 'message',
        role: 'user',
        content: [
          { type: 'text', text: 'First' },
          { type: 'text', text: 'Second' },
        ] as any,
      };
      
      render(<MessageView message={message} />);
      expect(screen.getByText('First\nSecond')).toBeTruthy();
    });

    it('renders user message with empty content', () => {
      const message: Message = {
        id: '4',
        type: 'message',
        role: 'user',
        content: '',
      };

      render(<MessageView message={message} />);
      expect(screen.getByLabelText('You: ')).toBeTruthy();
    });

    it('renders user message with null content', () => {
      const message: Message = {
        id: '5',
        type: 'message',
        role: 'user',
        content: null as any,
      };

      render(<MessageView message={message} />);
      expect(screen.getByLabelText('You: ')).toBeTruthy();
    });

    it('renders user message with undefined content', () => {
      const message: Message = {
        id: '6',
        type: 'message',
        role: 'user',
        content: undefined as any,
      };

      render(<MessageView message={message} />);
      expect(screen.getByLabelText('You: ')).toBeTruthy();
    });
  });

  describe('Assistant messages', () => {
    it('renders assistant message with string content', () => {
      const message: Message = {
        id: '7',
        type: 'message',
        role: 'assistant',
        content: 'AI response',
      };
      
      render(<MessageView message={message} />);
      expect(screen.getByTestId('chat-markdown')).toBeTruthy();
      expect(screen.getByText('AI response')).toBeTruthy();
    });

    it('renders assistant message with array content', () => {
      const message: Message = {
        id: '8',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Array AI response' }] as any,
      };
      
      render(<MessageView message={message} />);
      expect(screen.getByText('Array AI response')).toBeTruthy();
    });

    it('renders assistant message with empty content', () => {
      const message: Message = {
        id: '9',
        type: 'message',
        role: 'assistant',
        content: '',
      };

      render(<MessageView message={message} />);
      expect(screen.getByLabelText('Assistant: ')).toBeTruthy();
      // Nothing to copy, so the copy button stays out of the bubble.
      expect(screen.queryByLabelText('Copy message')).toBeNull();
    });
  });

  describe('Other message roles', () => {
    it('returns null for system message', () => {
      const message: Message = {
        id: '10',
        type: 'message',
        role: 'system',
        content: 'System message',
      };
      
      const { toJSON } = render(<MessageView message={message} />);
      expect(toJSON()).toBeNull();
    });

    it('returns null for tool message', () => {
      const message: Message = {
        id: '11',
        type: 'message',
        role: 'tool',
        content: 'Tool message',
      };
      
      const { toJSON } = render(<MessageView message={message} />);
      expect(toJSON()).toBeNull();
    });
  });

  describe('Content extraction', () => {
    it('filters non-text content types from array', () => {
      const message: Message = {
        id: '12',
        type: 'message',
        role: 'user',
        content: [
          { type: 'text', text: 'Text content' },
          { type: 'image', url: 'http://example.com/image.png' },
        ] as any,
      };
      
      render(<MessageView message={message} />);
      expect(screen.getByText('Text content')).toBeTruthy();
    });

    it('handles object content with type text', () => {
      const message: Message = {
        id: '13',
        type: 'message',
        role: 'user',
        content: { type: 'text', text: 'Object text content' } as any,
      };
      
      render(<MessageView message={message} />);
      expect(screen.getByText('Object text content')).toBeTruthy();
    });

    it('handles object content without text property', () => {
      const message: Message = {
        id: '14',
        type: 'message',
        role: 'user',
        content: { type: 'text' } as any,
      };

      render(<MessageView message={message} />);
      expect(screen.getByLabelText('You: ')).toBeTruthy();
    });

    it('routes a single non-text content object to the media renderer', () => {
      const message: Message = {
        id: '15',
        type: 'message',
        role: 'user',
        content: {
          type: 'image_url',
          image: { type: 'image', uri: 'https://example.com/image.png' },
        } as any,
      };

      render(<MessageView message={message} />);
      expect(screen.getByLabelText('Image content')).toBeTruthy();
      // The bubble carries no text, so the label reads as the bare prefix.
      expect(screen.getByLabelText('You: ')).toBeTruthy();
    });

    it('handles array with null items', () => {
      const message: Message = {
        id: '16',
        type: 'message',
        role: 'user',
        content: [null, { type: 'text', text: 'Valid text' }] as any,
      };
      
      render(<MessageView message={message} />);
      expect(screen.getByText('Valid text')).toBeTruthy();
    });

    it('handles array with missing text property', () => {
      const message: Message = {
        id: '17',
        type: 'message',
        role: 'user',
        content: [{ type: 'text' }] as any,
      };

      render(<MessageView message={message} />);
      expect(screen.getByLabelText('You: ')).toBeTruthy();
    });
  });
});
