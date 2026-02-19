import { useTranslation } from '@unfairenough/i18n';
import {
  Button,
  borderRadius,
  Card,
  colors,
  ScreenBackground,
  spacing,
  typography,
} from '@unfairenough/ui';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addRecentServer, getRecentServers, initRecentServers } from '../services/recentServers';

const TV_SAFE_HORIZONTAL = 96;
const TV_SAFE_VERTICAL = 54;

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed';

interface Props {
  onConnected: (serverUrl: string) => void;
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

    // Normalize URL for health check
    const host = serverUrl
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/^wss?:\/\//, '');
    const healthUrl = `http://${host}/api/health`;

    fetch(healthUrl)
      .then((res) => {
        if (res.ok) {
          setStatus('connected');
          addRecentServer(host).then(() => setRecentServers(getRecentServers()));
          // Short delay so user sees "Connected!" before transition
          setTimeout(() => onConnected(host), 500);
        } else {
          setStatus('failed');
        }
      })
      .catch(() => {
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
    paddingHorizontal: TV_SAFE_HORIZONTAL,
    paddingVertical: TV_SAFE_VERTICAL,
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
