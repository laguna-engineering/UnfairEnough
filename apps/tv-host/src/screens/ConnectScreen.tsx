import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import {
  colors,
  typography,
  spacing,
  borderRadius,
  Button,
  Card,
  ScreenBackground,
} from '@unfairenough/ui';
import { useTranslation } from '@unfairenough/i18n';

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

  const handleConnect = useCallback(() => {
    if (!serverUrl.trim()) return;

    setStatus('connecting');

    // Normalize URL for health check
    const host = serverUrl.trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
    const healthUrl = `http://${host}/api/health`;

    fetch(healthUrl)
      .then((res) => {
        if (res.ok) {
          setStatus('connected');
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
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>{t('connect.back')}</Text>
          </TouchableOpacity>
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
  },
  backText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
