/**
 * NewChatButton component for creating a new conversation.
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../hooks/useTheme';

export interface NewChatButtonProps {
  onPress: () => void;
}

export const NewChatButton: React.FC<NewChatButtonProps> = ({ onPress }) => {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: colors.primary }]}
      onPress={onPress}
      activeOpacity={0.8}
      testID="new-chat-button"
    >
      <Ionicons name="add" size={20} color={colors.onPrimary || '#FFFFFF'} />
      <Text style={[styles.text, { color: colors.onPrimary || '#FFFFFF' }]}>
        New Chat
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default NewChatButton;
