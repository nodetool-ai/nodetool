/**
 * One app, one screen.
 *
 * The document comes from the applications API — the released snapshot when
 * the app is published, the draft otherwise — and is rendered by the shared
 * mini-app runtime against the workflow its first operation binds.
 */

import { useEffect } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useApplicationApp } from '../hooks/useApplications';
import { ApplicationAppView } from '../components/app_runtime';
import { EmptyState, ErrorState, LoadingState, OfflineState } from '../components/ScreenState';

type Props = NativeStackScreenProps<RootStackParamList, 'App'>;

export default function AppScreen({ route, navigation }: Props) {
  const { isOffline } = useNetworkStatus();
  const { applicationId } = route.params;
  const { name, document, workflow, application, isLoading, error, refetch } =
    useApplicationApp(applicationId);

  useEffect(() => {
    navigation.setOptions({ title: name || route.params.name || 'App' });
  }, [name, navigation, route.params.name]);

  if (isLoading) {
    return <LoadingState label="Loading app" />;
  }

  const goBack = { label: 'Back to apps', icon: 'arrow-back' as const, onPress: () => navigation.goBack() };

  if (error) {
    return (
      <ErrorState
        title="Couldn't open this app"
        message={error.message}
        onRetry={refetch}
        secondaryAction={navigation.canGoBack() ? goBack : undefined}
      />
    );
  }

  if (!document || !workflow) {
    if (isOffline) {
      return <OfflineState onRetry={refetch} secondaryAction={navigation.canGoBack() ? goBack : undefined} />;
    }
    return (
      <EmptyState
        icon="construct-outline"
        title={document ? 'Workflow not available' : 'Nothing to show yet'}
        message={
          document
            ? 'This app runs a workflow this server does not have. Open it in the desktop or web app to fix it.'
            : 'This app has no screen yet. Build it in the desktop or web app builder.'
        }
        action={navigation.canGoBack() ? goBack : undefined}
      />
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
