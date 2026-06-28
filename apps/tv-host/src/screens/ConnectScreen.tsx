import { useTranslation } from '@unfairenough/i18n';
import { debugLog } from '@unfairenough/shared';
import {
  Button,
  borderRadius,
  Card,
  colors,
  ScreenBackground,
  spacing,
  tvSafeArea,
  typography,
} from '@unfairenough/ui';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addRecentServer, getRecentServers, initRecentServers } from '../services/recentServers';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed';

interface Props {
  onConnected: (serverUrl: string, mobileBaseUrl: string | null) => void;
  onBack: () => void;
}

export const ConnectScreen: React.FC<Props> = ({ onConnected, onBack }) => {
  const { t } = useTranslation();
  const [serverUrl, setServerUrl] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [recentServers, setRecentServers] = useState<string[]>([]);

  useEffect(() => {
    initRecentServers().then((servers) => {
      setRecentServers(servers);
      if (servers.length > 0) {
        setServerUrl(servers[0]);
      }
    });
  }, []);

  const handleConnect = useCallback(() => {
    if (!serverUrl.trim()) return;

    setStatus('connecting');

    // Normalize URL: extract host and detect protocol
    const trimmed = serverUrl.trim();
    const isSecure = /^https:\/\/|^wss:\/\//.test(trimmed);
    const host = trimmed.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
    const proto = isSecure ? 'https' : 'http';
    const healthUrl = `${proto}://${host}/api/health`;

    debugLog('[ConnectScreen] healthUrl:', healthUrl, 'isSecure:', isSecure);
    fetch(healthUrl)
      .then(async (res) => {
        debugLog('[ConnectScreen] health response status:', res.status);
        if (res.ok) {
          setStatus('connected');
          addRecentServer(`${proto}://${host}`).then(() => setRecentServers(getRecentServers()));

          // Use the server's LAN IP when on the same network, otherwise keep the original host
          const data = await res.json().catch(() => ({}));
          debugLog('[ConnectScreen] health data:', JSON.stringify(data));
          const isLanConnection = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host);
          const effectiveHost =
            isLanConnection && data.lanIp && data.port
              ? `${data.lanIp}:${data.port}`
              : `${proto}://${host}`;

          debugLog('[ConnectScreen] calling onConnected with:', effectiveHost);
          // Short delay so user sees "Connected!" before transition
          setTimeout(() => onConnected(effectiveHost, data.mobileBaseUrl ?? null), 500);
        } else {
          debugLog('[ConnectScreen] health check failed:', res.status);
          setStatus('failed');
        }
      })
      .catch((err) => {
        debugLog('[ConnectScreen] health check error:', err);
        setStatus('failed');
      });
  }, [serverUrl, onConnected]);

  const statusColor =
    status === 'connected'
      ? colors.success
      : status === 'failed'
        ? colors.error
        : colors.textSecondary;

  const statusText =
    status === 'connecting'
      ? t('connect.connecting')
      : status === 'connected'
        ? t('connect.connected')
        : status === 'failed'
          ? t('connect.connectionFailed')
          : null;

  return (
    <ScreenBackground style={styles.container}>
      <Card style={styles.card} variant="glow" glowColor={colors.primary}>
        <Text style={styles.title}>{t('connect.title')}</Text>

        <Text style={styles.label}>{t('connect.serverUrl')}</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder={t('connect.urlPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={status !== 'connecting'}
          onSubmitEditing={handleConnect}
        />

        {recentServers.length > 0 && (
          <View style={styles.recentContainer}>
            <Text style={styles.recentLabel}>{t('connect.recentServers')}</Text>
            {recentServers.map((address) => (
              <Pressable
                key={address}
                style={(state) => [
                  styles.recentRow,
                  (state as any).focused && styles.focused,
                  state.pressed && styles.pressed,
                ]}
                onPress={() => setServerUrl(address)}
              >
                <Text style={styles.recentRowText}>{address}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {statusText && (
          <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
        )}

        <View style={styles.buttons}>
          <Button
            title={status === 'failed' ? t('connect.retry') : t('common.connect')}
            onPress={handleConnect}
            disabled={!serverUrl.trim() || status === 'connecting'}
            size="large"
            style={styles.connectButton}
          />
          <Pressable
            onPress={onBack}
            style={(state) => [
              styles.backButton,
              (state as any).focused && styles.focused,
              state.pressed && styles.pressed,
            ]}
          >
            <Text style={styles.backText}>{t('connect.back')}</Text>
          </Pressable>
        </View>
      </Card>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: tvSafeArea.horizontal,
    paddingVertical: tvSafeArea.vertical,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    padding: spacing.xl,
    width: '100%',
    maxWidth: 500,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  recentContainer: {
    marginBottom: spacing.md,
  },
  recentLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  recentRow: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: spacing.xs,
  },
  recentRowText: {
    ...typography.body,
    color: colors.primary,
  },
  statusText: {
    ...typography.bodySmall,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  buttons: {
    alignItems: 'center',
    gap: spacing.md,
  },
  connectButton: {
    minWidth: 200,
  },
  backButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  backText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  focused: {
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.8,
  },
});
