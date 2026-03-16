import { useTranslation } from '@unfairenough/i18n';
import { Card, colors, ScreenBackground, spacing, tvSafeArea, typography } from '@unfairenough/ui';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { AuthChallenge } from '../services/HostedGameController';

const QR_SIZE = 280;

type LoginState = 'connecting' | 'waiting' | 'expired' | 'approved' | 'failed';

interface Props {
  challenge: AuthChallenge | null;
  loginState: LoginState;
  onCancel: () => void;
}

export const AccountLoginScreen: React.FC<Props> = ({ challenge, loginState, onCancel }) => {
  const { t } = useTranslation();
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

      <Card style={styles.qrCard} variant="glow" glowColor="#10b981">
        {challenge?.verificationUrl ? (
          <View style={styles.qrContainer}>
            <QRCode
              value={challenge.verificationUrl}
              size={QR_SIZE}
              backgroundColor="white"
              color={colors.background}
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

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: tvSafeArea.horizontal,
    paddingVertical: tvSafeArea.vertical,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...typography.displayMedium,
    color: colors.primary,
    marginBottom: spacing.xl,
  },
  qrCard: {
    padding: spacing.lg,
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
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  placeholderText: {
    ...typography.h2,
    color: colors.textSecondary,
  },
  codeText: {
    ...typography.h1,
    color: colors.textPrimary,
    letterSpacing: 8,
    marginTop: spacing.lg,
    fontFamily: 'Nunito_700Bold',
  },
  instruction: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  statusText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  cancelButton: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.textSecondary,
  },
  cancelFocused: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cancelText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
