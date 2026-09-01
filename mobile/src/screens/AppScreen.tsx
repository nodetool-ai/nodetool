/**
 * One app, one screen.
 *
 * The document comes from the applications API — the released snapshot when
 * the app is published, the draft otherwise — and is rendered by the shared
 * mini-app runtime against the workflow its first operation binds.
 */

import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import { useApplicationApp } from '../hooks/useApplications';
import { ApplicationAppView } from '../components/app_runtime';

type Props = NativeStackScreenProps<RootStackParamList, 'App'>;

export default function AppScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { applicationId } = route.params;
  const { name, document, workflow, application, isLoading, error } =
    useApplicationApp(applicationId);

  useEffect(() => {
    navigation.setOptions({ title: name || route.params.name || 'App' });
  }, [name, navigation, route.params.name]);

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          Loading app...
        </Text>
      </View>
    );
  }

  if (error || !document || !workflow) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="warning-outline" size={40} color={colors.error} />
        <Text style={[styles.message, { color: colors.error }]}>
          {error?.message ??
            (document
              ? 'This app runs a workflow that is not available.'
              : 'This app has nothing to show yet.')}
        </Text>
      </View>
    );
  }

  return (
    <ApplicationAppView
      document={document}
      applicationId={applicationId}
      workflow={workflow}
      {...(application ? { application } : {})}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
  },
});
