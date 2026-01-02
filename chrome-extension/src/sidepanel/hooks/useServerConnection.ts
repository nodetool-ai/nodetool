/**
 * Hook for managing server connection and health checks.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useExtensionStore } from '../store';

const HEALTH_CHECK_INTERVAL = 10000; // 10 seconds

export function useServerConnection() {
  const healthCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    serverConfig,
    connectionStatus,
    setConnectionStatus,
    setConnectionError
  } = useExtensionStore();

  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`${serverConfig.url}/health/`, {
        method: 'GET',
        headers: serverConfig.apiKey
          ? { Authorization: `Bearer ${serverConfig.apiKey}` }
          : {}
      });
      return response.ok;
    } catch {
      return false;
    }
  }, [serverConfig.url, serverConfig.apiKey]);

  const testConnection = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setConnectionStatus('connecting');
    setConnectionError(null);

    try {
      const isHealthy = await checkHealth();
      
      if (isHealthy) {
        setConnectionStatus('connected');
        return { success: true };
      } else {
        setConnectionStatus('failed');
        setConnectionError('Server health check failed');
        return { success: false, error: 'Server health check failed' };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      setConnectionStatus('failed');
      setConnectionError(message);
      return { success: false, error: message };
    }
  }, [checkHealth, setConnectionStatus, setConnectionError]);

  // Start periodic health checks when connected
  useEffect(() => {
    if (connectionStatus === 'connected') {
      healthCheckIntervalRef.current = setInterval(async () => {
        const isHealthy = await checkHealth();
        if (!isHealthy && connectionStatus === 'connected') {
          setConnectionStatus('disconnected');
          setConnectionError('Connection lost');
        }
      }, HEALTH_CHECK_INTERVAL);
    }

    return () => {
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
        healthCheckIntervalRef.current = null;
      }
    };
  }, [connectionStatus, checkHealth, setConnectionStatus, setConnectionError]);

  return {
    testConnection,
    checkHealth,
    connectionStatus,
    serverUrl: serverConfig.url
  };
}

export default useServerConnection;
