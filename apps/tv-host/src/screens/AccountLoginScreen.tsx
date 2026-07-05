import { useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  Card,
  ScreenBackground,
  spacing,
  type ThemeTokens,
  tvSafeArea,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { AuthChallenge } from '../services/HostedGameController';

const QR_SIZE = 160;

type LoginState = 'connecting' | 'waiting' | 'expired' | 'approved' | 'failed';

interface Props {
  challenge: AuthChallenge | null;
  loginState: LoginState;
  onCancel: () => void;
}

export const AccountLoginScreen: React.FC<Props> = ({ challenge, loginState, onCancel }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!challenge) return;
    setCountdown(challenge.expiresIn);
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  const statusText = (() => {
    switch (loginState) {
      case 'connecting':
        return t('accountLogin.waitingForApproval');
      case 'waiting':
        return `${t('accountLogin.waitingForApproval')} (${countdown}s)`;
      case 'expired':
        return t('accountLogin.codeExpired');
      case 'approved':
        return t('accountLogin.approved');
      case 'failed':
        return t('accountLogin.failed');
    }
  })();

  return (
    <ScreenBackground style={styles.container}>
      <Text style={styles.title}>{t('accountLogin.title')}</Text>

      <Card style={styles.qrCard}>
        {challenge?.verificationUrl ? (
          <View style={styles.qrContainer}>
            <QRCode
              value={challenge.verificationUrl}
              size={QR_SIZE}
              backgroundColor="white"
              color="#0d0f1a"
            />
          </View>
        ) : (
          <View style={[styles.qrContainer, styles.qrPlaceholder]}>
            <Text style={styles.placeholderText}>...</Text>
          </View>
        )}
      </Card>

      {challenge?.userCode ? <Text style={styles.codeText}>{challenge.userCode}</Text> : null}

      <Text style={styles.instruction}>{t('accountLogin.instruction')}</Text>
      {challenge?.verificationUrl ? (
        <Text style={styles.urlText} selectable>
          {challenge.verificationUrl}
        </Text>
      ) : null}
      <Text style={styles.statusText}>{statusText}</Text>

      <Pressable
        style={(state) => [styles.cancelButton, (state as any).focused && styles.cancelFocused]}
        onPress={onCancel}
      >
        <Text style={styles.cancelText}>{t('accountLogin.cancel')}</Text>
      </Pressable>
    </ScreenBackground>
  );
};

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: tvSafeArea.horizontal,
      paddingVertical: spacing.lg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      ...typography.h1,
      color: t.title,
      marginBottom: spacing.md,
      textAlign: 'center',
    },
    qrCard: {
      padding: spacing.md,
      alignItems: 'center',
    },
    qrContainer: {
      borderRadius: 12,
      overflow: 'hidden',
    },
    qrPlaceholder: {
      width: QR_SIZE,
      height: QR_SIZE,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.segTrack,
    },
    placeholderText: {
      ...typography.h2,
      color: t.inkSoft,
    },
    codeText: {
      ...typography.h2,
      color: t.ink,
      letterSpacing: 8,
      marginTop: spacing.md,
      fontFamily: 'Nunito_700Bold',
    },
    instruction: {
      ...typography.body,
      color: t.inkSoft,
      marginTop: spacing.sm,
      textAlign: 'center',
      maxWidth: 900,
    },
    urlText: {
      ...typography.bodySmall,
      color: t.accent,
      marginTop: spacing.xs,
      textAlign: 'center',
      maxWidth: 900,
    },
    statusText: {
      ...typography.bodySmall,
      color: t.inkSoft,
      marginTop: spacing.sm,
    },
    cancelButton: {
      marginTop: spacing.lg,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 2,
      borderColor: t.cardBorder,
    },
    cancelFocused: {
      borderColor: t.accent,
    },
    cancelText: {
      ...typography.body,
      color: t.inkSoft,
    },
  });
