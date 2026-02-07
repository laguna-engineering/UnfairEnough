import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  colors,
  typography,
  spacing,
  borderRadius,
  Button,
  Card,
  PlayerAvatar,
  ScreenBackground,
} from '@unfairenough/ui';
import { playersSelectors } from '@unfairenough/game-logic';
import { useTranslation, changeLanguage, type SupportedLanguage } from '@unfairenough/i18n';
import { questionsRepo, type QuestionSetWithMeta } from '@unfairenough/db';
import { useGameController } from '../hooks/useGameController';
import { getDb } from '../services/database';
import { ImportQuestionsModal } from './ImportQuestionsModal';

// TV safe zone padding (5% of 1080p)
const TV_SAFE_HORIZONTAL = 96;
const TV_SAFE_VERTICAL = 54;
const QR_SIZE = 240;

const LANGUAGES: { code: SupportedLanguage; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'it', label: 'IT' },
];

export const LobbyScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { state, startGame, configureGame, setLanguage, roomCode, qrUrl, gameConfig, mode } = useGameController();
  const [selectedMode, setSelectedMode] = useState<'casual' | 'configured'>(gameConfig.gameType ?? 'casual');
  const [showImportModal, setShowImportModal] = useState(false);
  const [questionSets, setQuestionSets] = useState<QuestionSetWithMeta[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);

  const loadQuestionSets = useCallback(async () => {
    if (mode !== 'local') return;
    try {
      const db = getDb();
      const sets = await questionsRepo.getQuestionSets(db);
      setQuestionSets(sets);
      const count = await questionsRepo.getTotalQuestionCount(db);
      setTotalQuestions(count);
    } catch (err) {
      console.error('Failed to load question sets:', err);
    }
  }, [mode]);

  useEffect(() => {
    loadQuestionSets();
  }, [loadQuestionSets]);

  const handleLanguageChange = useCallback((lang: SupportedLanguage) => {
    changeLanguage(lang);
    setLanguage(lang);
  }, [setLanguage]);

  const handleModeChange = useCallback((mode: 'casual' | 'configured') => {
    setSelectedMode(mode);
    if (mode === 'casual') {
      configureGame('casual');
    }
  }, [configureGame]);

  const players = playersSelectors.selectAll(state.players);
  const playerCount = players.length;
  const canStart = playerCount >= state.game.config.minPlayers;

  return (
    <ScreenBackground style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('lobby.title')}</Text>
        <View style={styles.languageSwitcher}>
          {LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              onPress={() => handleLanguageChange(lang.code)}
              style={[
                styles.languageButton,
                i18n.language === lang.code && styles.languageButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.languageButtonText,
                  i18n.language === lang.code && styles.languageButtonTextActive,
                ]}
              >
                {lang.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.content}>
        {/* QR Code Section */}
        <View style={styles.qrSection}>
          <Card style={styles.qrCard} variant="glow" glowColor={colors.primary}>
            {qrUrl ? (
              <>
                <View style={styles.qrContainer}>
                  <QRCode
                    value={qrUrl}
                    size={QR_SIZE}
                    backgroundColor="white"
                    color={colors.background}
                  />
                </View>
                <View style={styles.codeContainer}>
                  <Text style={styles.codeLabel}>{t('lobby.orEnterCode', { code: '' }).replace(': ', '')}</Text>
                  <Text style={styles.roomCode}>{roomCode}</Text>
                </View>
              </>
            ) : (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>{t('lobby.serverStarting')}</Text>
              </View>
            )}
          </Card>
        </View>

        {/* Players Section */}
        <View style={styles.playersSection}>
          <Card style={styles.playersCard}>
            <Text style={styles.playersTitle}>
              {playerCount === 0
                ? t('lobby.waitingForPlayers')
                : t('lobby.playersJoined', { count: playerCount })}
            </Text>

            <View style={styles.playersList}>
              {players.map((player) => (
                <PlayerAvatar
                  key={player.id}
                  name={player.name}
                  color={player.color}
                  size={playerCount > 6 ? 'medium' : 'large'}
                />
              ))}
              {players.length === 0 && (
                <Text style={styles.waitingText}>
                  {t('lobby.scanQrToJoin')}
                </Text>
              )}
            </View>
          </Card>

          {/* Game Mode Selector */}
          <View style={styles.gameModeContainer}>
            <View style={styles.gameModeHeader}>
              <Text style={styles.gameModeLabel}>{t('gameConfig.gameMode')}</Text>
              {mode === 'local' && (
                <Text style={styles.questionCount}>
                  {t('gameConfig.totalQuestions', { count: totalQuestions })}
                </Text>
              )}
            </View>
            <View style={styles.gameModeButtons}>
              <TouchableOpacity
                onPress={() => handleModeChange('casual')}
                style={[
                  styles.gameModeButton,
                  selectedMode === 'casual' && styles.gameModeButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.gameModeButtonText,
                    selectedMode === 'casual' && styles.gameModeButtonTextActive,
                  ]}
                >
                  {t('gameConfig.casual')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleModeChange('configured')}
                style={[
                  styles.gameModeButton,
                  selectedMode === 'configured' && styles.gameModeButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.gameModeButtonText,
                    selectedMode === 'configured' && styles.gameModeButtonTextActive,
                  ]}
                >
                  {t('gameConfig.configured')}
                </Text>
              </TouchableOpacity>
              {mode === 'local' && (
                <TouchableOpacity
                  onPress={() => setShowImportModal(true)}
                  style={styles.importButton}
                >
                  <Text style={styles.importButtonText}>
                    {t('gameConfig.importQuestions')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Question Set Picker (configured mode, local only) */}
            {selectedMode === 'configured' && mode === 'local' && (
              <ScrollView
                horizontal
                style={styles.setPickerContainer}
                contentContainerStyle={styles.setPickerContent}
                showsHorizontalScrollIndicator={false}
              >
                {questionSets.length === 0 ? (
                  <Text style={styles.noSetsText}>{t('gameConfig.noSets')}</Text>
                ) : (
                  questionSets.map((set) => (
                    <TouchableOpacity
                      key={set.id}
                      onPress={() => configureGame('configured', set.id)}
                      style={[
                        styles.setCard,
                        gameConfig.questionSetId === set.id && styles.setCardActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.setCardName,
                          gameConfig.questionSetId === set.id && styles.setCardNameActive,
                        ]}
                        numberOfLines={1}
                      >
                        {set.name}
                      </Text>
                      <Text style={styles.setCardCount}>
                        {t('gameConfig.questionsCount', { count: set.questionCount })}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </View>

          {/* Start Button */}
          <View style={styles.startButtonContainer}>
            <Button
              title={t('lobby.startGame')}
              onPress={startGame}
              disabled={!canStart}
              size="large"
              style={styles.startButton}
            />
            {!canStart && playerCount > 0 && (
              <Text style={styles.hintText}>
                {t('lobby.needMorePlayers', { min: state.game.config.minPlayers })}
              </Text>
            )}
          </View>
        </View>
      </View>

      {mode === 'local' && (
        <ImportQuestionsModal
          visible={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImported={loadQuestionSets}
        />
      )}
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: TV_SAFE_HORIZONTAL,
    paddingVertical: TV_SAFE_VERTICAL,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.displayMedium,
    color: colors.primary,
  },
  languageSwitcher: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  languageButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.textSecondary,
  },
  languageButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  languageButtonText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  languageButtonTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xxl,
  },
  qrSection: {
    flex: 0.42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrCard: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  qrContainer: {
    padding: spacing.sm,
    backgroundColor: 'white',
    borderRadius: borderRadius.md,
  },
  codeContainer: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  codeLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  roomCode: {
    ...typography.h2,
    color: colors.accentYellow,
    letterSpacing: 4,
  },
  loadingContainer: {
    width: QR_SIZE,
    height: QR_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.h3,
    color: colors.textSecondary,
  },
  playersSection: {
    flex: 0.58,
    justifyContent: 'center',
  },
  playersCard: {
    padding: spacing.lg,
    marginBottom: spacing.lg,
    minHeight: 160,
  },
  playersTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  playersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 80,
    alignItems: 'center',
  },
  waitingText: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  gameModeContainer: {
    marginBottom: spacing.lg,
  },
  gameModeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  gameModeLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  questionCount: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  gameModeButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  importButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.accentYellow,
    borderStyle: 'dashed',
  },
  importButtonText: {
    ...typography.body,
    color: colors.accentYellow,
  },
  setPickerContainer: {
    marginTop: spacing.sm,
    maxHeight: 70,
  },
  setPickerContent: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  setCard: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    minWidth: 120,
  },
  setCardActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  setCardName: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  setCardNameActive: {
    color: colors.textPrimary,
  },
  setCardCount: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
  },
  noSetsText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.sm,
  },
  gameModeButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.textSecondary,
  },
  gameModeButtonActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  gameModeButtonText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  gameModeButtonTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  startButtonContainer: {
    alignItems: 'center',
  },
  startButton: {
    minWidth: 260,
  },
  hintText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
