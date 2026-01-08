/**
 * Voice Command Assistant for AI Workflow Creation
 * 
 * This module provides voice command functionality that allows users to:
 * - Record voice commands for workflow creation
 * - Convert speech to text using Web Speech API
 * - Parse voice commands into workflow operations
 * - Integrate with the existing AI chat system
 */

import { useCallback, useEffect, useRef, useState } from "react";
import useGlobalChatStore from "../../stores/GlobalChatStore";

export interface VoiceCommandState {
  isListening: boolean;
  isProcessing: boolean;
  transcript: string;
  error: string | null;
  confidence: number;
}

export interface VoiceCommandResult {
  success: boolean;
  command?: string;
  action?: string;
  parameters?: Record<string, any>;
  error?: string;
}

export type VoiceCommandCallback = (result: VoiceCommandResult) => void;

export function useVoiceCommandAssistant() {
  const [state, setState] = useState<VoiceCommandState>({
    isListening: false,
    isProcessing: false,
    transcript: "",
    error: null,
    confidence: 0
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sendMessage = useGlobalChatStore((s) => s.sendMessage);
  const currentThreadId = useGlobalChatStore((s) => s.currentThreadId);

  const processVoiceCommand = useCallback((transcript: string): VoiceCommandResult => {
    const lowerTranscript = transcript.toLowerCase().trim();
    
    const workflowPatterns = [
      {
        pattern: /create\s+(?:a\s+)?(?:new\s+)?workflow\s+(?:for\s+)?(.+)/i,
        action: "create_workflow",
        extractParams: (match: RegExpMatchArray) => ({ description: match[1].trim() })
      },
      {
        pattern: /add\s+(?:a\s+)?(.+?)\s+node\s+(?:to\s+)?(?:the\s+)?workflow/i,
        action: "add_node",
        extractParams: (match: RegExpMatchArray) => ({ nodeType: match[1].trim() })
      },
      {
        pattern: /connect\s+(.+?)\s+(?:to|with)\s+(.+)/i,
        action: "connect_nodes",
        extractParams: (match: RegExpMatchArray) => ({ 
          source: match[1].trim(), 
          target: match[2].trim() 
        })
      },
      {
        pattern: /run\s+(?:the\s+)?workflow/i,
        action: "run_workflow",
        extractParams: () => ({})
      },
      {
        pattern: /save\s+(?:the\s+)?workflow/i,
        action: "save_workflow",
        extractParams: () => ({})
      },
      {
        pattern: /create\s+(?:a\s+)?text\s+node\s+(?:with\s+)?(.+)/i,
        action: "create_text_node",
        extractParams: (match: RegExpMatchArray) => ({ content: match[1].trim() })
      },
      {
        pattern: /add\s+(?:a\s+)?(.+?)\s+input\s+(?:node)?/i,
        action: "add_input_node",
        extractParams: (match: RegExpMatchArray) => ({ inputType: match[1].trim() })
      },
      {
        pattern: /add\s+(?:a\s+)?(.+?)\s+output\s+(?:node)?/i,
        action: "add_output_node",
        extractParams: (match: RegExpMatchArray) => ({ outputType: match[1].trim() })
      }
    ];

    for (const { pattern, action, extractParams } of workflowPatterns) {
      const match = lowerTranscript.match(pattern);
      if (match) {
        return {
          success: true,
          command: transcript,
          action,
          parameters: extractParams(match)
        };
      }
    }

    return {
      success: false,
      command: transcript,
      error: "Could not parse voice command. Please try again or use the chat interface."
    };
  }, []);

  const sendVoiceCommandToChat = useCallback(async (transcript: string) => {
    if (!currentThreadId) {
      return {
        success: false,
        error: "No active chat thread"
      };
    }

    try {
      const commandResult = processVoiceCommand(transcript);
      
      if (commandResult.success && commandResult.action) {
        const message = {
          type: "message" as const,
          id: crypto.randomUUID(),
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: `Voice command: "${transcript}"\n\nAction: ${commandResult.action}\nParameters: ${JSON.stringify(commandResult.parameters || {}, null, 2)}`
            }
          ],
          thread_id: currentThreadId,
          created_at: new Date().toISOString() as any
        };

        await sendMessage(message);
        
        return {
          success: true,
          command: transcript,
          action: commandResult.action,
          parameters: commandResult.parameters
        };
      } else {
        const message = {
          type: "message" as const,
          id: crypto.randomUUID(),
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: `I said: "${transcript}"`
            }
          ],
          thread_id: currentThreadId,
          created_at: new Date().toISOString() as any
        };

        await sendMessage(message);
        
        return {
          success: false,
          command: transcript,
          error: commandResult.error
        };
      }
    } catch (error) {
      console.error("Failed to send voice command:", error);
      return {
        success: false,
        command: transcript,
        error: error instanceof Error ? error.message : "Failed to process voice command"
      };
    }
  }, [currentThreadId, sendMessage, processVoiceCommand]);

  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setState(prev => ({
        ...prev,
        error: "Speech recognition is not supported in this browser. Please use Chrome or Edge."
      }));
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition() as any;
    
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setState(prev => ({
        ...prev,
        isListening: true,
        isProcessing: false,
        transcript: "",
        error: null,
        confidence: 0
      }));

      timeoutRef.current = setTimeout(() => {
        setState(prevState => {
          if (prevState.isListening) {
            stopListening();
          }
          return prevState;
        });
      }, 10000);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
          setState(prev => ({
            ...prev,
            confidence: event.results[i][0].confidence
          }));
        } else {
          interimTranscript += transcript;
        }
      }

      const resultTranscript = finalTranscript || interimTranscript;
      
      setState(prev => ({
        ...prev,
        transcript: resultTranscript,
        isProcessing: finalTranscript.length > 0
      }));

      if (finalTranscript) {
        sendVoiceCommandToChat(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      setState(prev => ({
        ...prev,
        isListening: false,
        isProcessing: false,
        error: event.error === 'no-speech' 
          ? "No speech detected. Please try again." 
          : `Speech recognition error: ${event.error}`
      }));
    };

    recognition.onend = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setState(prev => ({
        ...prev,
        isListening: false,
        isProcessing: false
      }));
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [sendVoiceCommandToChat]); // stopListening removed from dependencies to avoid circular reference

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isListening: false,
      isProcessing: false
    }));
  }, []);

  const clearTranscript = useCallback(() => {
    setState(prev => ({
      ...prev,
      transcript: "",
      confidence: 0
    }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null
    }));
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  return {
    state,
    startListening,
    stopListening,
    clearTranscript,
    clearError,
    sendVoiceCommand: sendVoiceCommandToChat,
    processVoiceCommand,
    isSupported: () => 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
  };
}

export default useVoiceCommandAssistant;
