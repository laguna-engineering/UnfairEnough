import { useTranslation } from '@unfairenough/i18n';
import { debugLog } from '@unfairenough/shared';
import {
  Button,
  borderRadius,
  ScreenBackground,
  spacing,
  type ThemeTokens,
  tvSafeArea,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addRecentServer, getRecentServers, initRecentServers } from '../services/recentServers';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed';

interface Props {
  onConnected: (serverUrl: string, mobileBaseUrl: string | null) => void;
  onBack: () => void;
  /** Preconfigured server (from extra.serverUrl) offered as a one-click option. */
  defaultServerUrl?: string;
}

export const ConnectScreen: React.FC<Props> = ({ onConnected, onBack, defaultServerUrl }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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

  const handleConnect = useCallback(
    (urlOverride?: string) => {
      const trimmed = (urlOverride ?? serverUrl).trim();
      if (!trimmed) return;

      setStatus('connecting');

      // Normalize URL: extract host and detect protocol
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
    },
    [serverUrl, onConnected],
  );

  const statusColor =
    status === 'connected' ? theme.success : status === 'failed' ? theme.error : theme.inkSoft;

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
      <View style={styles.card}>
        <Text style={styles.title}>{t('connect.title')}</Text>

        <Text style={styles.label}>{t('connect.serverUrl')}</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder={t('connect.urlPlaceholder')}
          placeholderTextColor={theme.inkSoft}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={status !== 'connecting'}
          onSubmitEditing={() => handleConnect()}
        />

        {defaultServerUrl && (
          <View style={styles.recentContainer}>
            <Text style={styles.recentLabel}>{t('connect.defaultServer')}</Text>
            <Pressable
              hasTVPreferredFocus
              disabled={status === 'connecting'}
              style={(state) => [
                styles.recentRow,
                (state as any).focused && styles.focused,
                state.pressed && styles.pressed,
              ]}
              onPress={() => {
                setServerUrl(defaultServerUrl);
                handleConnect(defaultServerUrl);
              }}
            >
              <Text style={styles.recentRowText}>{defaultServerUrl}</Text>
            </Pressable>
          </View>
        )}

        {recentServers.filter((a) => a !== defaultServerUrl).length > 0 && (
          <View style={styles.recentContainer}>
            <Text style={styles.recentLabel}>{t('connect.recentServers')}</Text>
            {recentServers
              .filter((a) => a !== defaultServerUrl)
              .map((address) => (
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
            onPress={() => handleConnect()}
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
      </View>
    </ScreenBackground>
  );
};

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: tvSafeArea.horizontal,
      paddingVertical: tvSafeArea.vertical,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // Flat modal card: one translucent fill, one subtle border, no shadow/glow.
    card: {
      backgroundColor: t.card,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
      borderRadius: borderRadius.xl,
      padding: spacing.xl,
      width: '100%',
      maxWidth: 560,
    },
    title: {
      ...typography.h2,
      color: t.ink,
      marginBottom: spacing.lg,
      textAlign: 'center',
    },
    label: {
      ...typography.label,
      color: t.inkSoft,
      marginBottom: spacing.xs,
    },
    input: {
      ...typography.body,
      color: t.ink,
      backgroundColor: t.segTrack,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
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
      color: t.inkSoft,
      marginBottom: spacing.xs,
    },
    recentRow: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 2,
      borderColor: 'transparent',
      backgroundColor: t.card,
      marginBottom: spacing.xs,
    },
    recentRowText: {
      ...typography.body,
      color: t.accent,
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
      borderRadius: borderRadius.md,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    backText: {
      ...typography.body,
      color: t.inkSoft,
    },
    focused: {
      borderColor: t.accent,
    },
    pressed: {
      opacity: 0.8,
    },
  });
