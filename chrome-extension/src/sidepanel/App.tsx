/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { useEffect, useRef, useCallback } from 'react';
import { Box, CssBaseline, ThemeProvider } from '@mui/material';
import ThemeNodetool from '../themes/ThemeNodetool';
import {
  ChatHeader,
  ChatMessage,
  ChatInput,
  Settings,
  ServerStatus,
  EmptyChatState
} from './components';
import { useExtensionStore } from './store';
import { useWebSocket } from './hooks/useWebSocket';
import type { PageContext } from '../types';
import '../styles/index.css';

const appContainerStyles = css({
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  width: '100%',
  overflow: 'hidden'
});

const chatContainerStyles = css({
  flex: 1,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column'
});

const messagesContainerStyles = css({
  flex: 1,
  overflow: 'auto',
  paddingTop: '16px'
});

function App() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {
    connectionStatus,
    connectionError,
    pageContext,
    setPageContext
  } = useExtensionStore();

  const messages = useExtensionStore((state) => state.getCurrentMessages());
  const isStreaming = useExtensionStore((state) => state.isStreaming);

  const { connect, sendMessage, stopGeneration, isConnected } = useWebSocket();

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Request page context from content script
  const requestPageContext = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
        if (response?.context) {
          setPageContext(response.context as PageContext);
        }
      }
    } catch (error) {
      console.log('Failed to get page context:', error);
    }
  }, [setPageContext]);

  // Get page context when component mounts and when tab changes
  useEffect(() => {
    requestPageContext();

    // Listen for tab updates
    const handleTabUpdate = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status === 'complete') {
        requestPageContext();
      }
    };

    chrome.tabs.onUpdated.addListener(handleTabUpdate);
    chrome.tabs.onActivated.addListener(() => requestPageContext());

    return () => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdate);
    };
  }, [requestPageContext]);

  // Handle sending message with optional page context
  const handleSendMessage = useCallback(
    async (message: string, includeContext: boolean) => {
      const context = includeContext && pageContext
        ? {
            pageUrl: pageContext.url,
            pageTitle: pageContext.title,
            pageContent: pageContext.bodyText
          }
        : undefined;

      await sendMessage(message, context);
    },
    [sendMessage, pageContext]
  );

  // Determine what to show in the chat area
  const renderChatContent = () => {
    // Show status if not connected
    if (!isConnected && connectionStatus !== 'connected') {
      return <ServerStatus status={connectionStatus} error={connectionError} onRetry={connect} />;
    }

    // Show empty state if no messages
    if (messages.length === 0) {
      return <EmptyChatState />;
    }

    // Show messages
    return (
      <Box css={messagesContainerStyles}>
        {messages.map((msg, index) => (
          <ChatMessage
            key={msg.id || index}
            message={msg}
            isStreaming={isStreaming && index === messages.length - 1 && msg.role === 'assistant'}
          />
        ))}
        <div ref={messagesEndRef} />
      </Box>
    );
  };

  return (
    <ThemeProvider theme={ThemeNodetool} defaultMode="dark">
      <CssBaseline />
      <Box css={appContainerStyles} sx={{ bgcolor: 'background.default', color: 'text.primary' }}>
        <ChatHeader />

        <Box css={chatContainerStyles}>
          {renderChatContent()}
        </Box>

        <ChatInput
          onSendMessage={handleSendMessage}
          onStopGeneration={stopGeneration}
          disabled={!isConnected}
        />

        <Settings />
      </Box>
    </ThemeProvider>
  );
}

export default App;
