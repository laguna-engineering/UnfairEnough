import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import { colors, typography, spacing, borderRadius, Button } from '@unfairenough/ui';
import { useTranslation } from '@unfairenough/i18n';
import { parseQuestionSetYaml, questionsRepo } from '@unfairenough/db';
import { getDb } from '../services/database';

interface Props {
  visible: boolean;
  onClose: () => void;
  onImported: () => void;
}

export const ImportQuestionsModal: React.FC<Props> = ({ visible, onClose, onImported }) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleImport = async () => {
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(url.trim());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const yamlText = await response.text();
      const result = parseQuestionSetYaml(yamlText);

      if (!result.success) {
        setError(result.errors.join('\n'));
        setLoading(false);
        return;
      }

      const db = getDb();
      const setId = Crypto.randomUUID();
      await questionsRepo.importQuestionSet(db, setId, result.data, () => Crypto.randomUUID());

      setSuccess(t('gameConfig.importSuccess', { count: result.data.questions.length }));
      setUrl('');
      setLoading(false);
      onImported();
    } catch (err) {
      setError(t('gameConfig.importError', {
        error: err instanceof Error ? err.message : String(err),
      }));
      setLoading(false);
    }
  };

  const handleClose = () => {
    setUrl('');
    setError(null);
    setSuccess(null);
    setLoading(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>{t('gameConfig.importFromUrl')}</Text>

          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder={t('gameConfig.urlPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          {error && <Text style={styles.error}>{error}</Text>}
          {success && <Text style={styles.success}>{success}</Text>}

          <View style={styles.buttons}>
            <Button
              title={t('common.cancel')}
              onPress={handleClose}
              variant="outline"
              disabled={loading}
            />
            {loading ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Button
                title={t('gameConfig.importQuestions')}
                onPress={handleImport}
                disabled={!url.trim()}
              />
            )}
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
    marginBottom: spacing.lg,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  error: {
    ...typography.bodySmall,
    color: colors.error,
    marginBottom: spacing.md,
  },
  success: {
    ...typography.bodySmall,
    color: colors.success,
    marginBottom: spacing.md,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    alignItems: 'center',
  },
});
