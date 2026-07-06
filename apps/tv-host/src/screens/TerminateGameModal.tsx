import { useTranslation } from '@unfairenough/i18n';
import { Button, borderRadius, colors, spacing, typography } from '@unfairenough/ui';
import type React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

interface Props {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const TerminateGameModal: React.FC<Props> = ({ visible, onCancel, onConfirm }) => {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>{t('game.terminateTitle')}</Text>
          <Text style={styles.message}>{t('game.terminateMessage')}</Text>

          <View style={styles.buttons}>
            <Button
              title={t('common.cancel')}
              onPress={onCancel}
              variant="outline"
              hasTVPreferredFocus
            />
            <Button title={t('game.terminateConfirm')} onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '50%',
    maxWidth: 600,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    alignItems: 'center',
  },
});
