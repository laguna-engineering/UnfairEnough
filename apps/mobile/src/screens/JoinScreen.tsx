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
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

interface JoinScreenProps {
  onJoin: (name: string) => void;
  isConnecting: boolean;
  error: string | null;
}

export const JoinScreen: React.FC<JoinScreenProps> = ({ onJoin, isConnecting, error }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');

  const handleJoin = () => {
    const trimmedName = name.trim();
    if (trimmedName.length > 0) {
      onJoin(trimmedName);
    }
  };

  return (
    <ScreenBackground>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <Text style={styles.title}>{t('join.join')}</Text>

          <Card style={styles.card}>
            <Text style={styles.label}>{t('join.whatsYourName')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('join.namePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              maxLength={20}
              autoFocus
              returnKeyType="join"
              onSubmitEditing={handleJoin}
            />

            {error && <Text style={styles.error}>{error}</Text>}

            <Button
              title={isConnecting ? t('join.joining') : t('join.join')}
              onPress={handleJoin}
              disabled={name.trim().length === 0 || isConnecting}
              loading={isConnecting}
              style={styles.button}
            />
          </Card>
        </View>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  card: {
    padding: spacing.xl,
  },
  label: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  error: {
    ...typography.bodySmall,
    color: colors.error,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  button: {
    marginTop: spacing.md,
  },
});
