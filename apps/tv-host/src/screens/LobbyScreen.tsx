import { type QuestionSetWithMeta, questionsRepo } from '@unfairenough/db';
import { playersSelectors } from '@unfairenough/game-logic';
import { changeLanguage, type SupportedLanguage, useTranslation } from '@unfairenough/i18n';
import {
  Button,
  borderRadius,
  Card,
  colors,
  PlayerAvatar,
  ScreenBackground,
  spacing,
  typography,
} from '@unfairenough/ui';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { findNodeHandle, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useGameController } from '../hooks/useGameController';
import { getDb } from '../services/database';
import { ImportQuestionsModal } from './ImportQuestionsModal';

// TV safe zone padding (5% of 1080p)
const TV_SAFE_HORIZONTAL = 96;
const TV_SAFE_VERTICAL = 54;
const QR_SIZE = 200;

const LANGUAGES: { code: SupportedLanguage; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'it', label: 'IT' },
];

interface BgMusic {
  isMuted: boolean;
  toggleMute: () => void;
  hasTracks: boolean;
}

const MOCK_QUESTION_SETS: QuestionSetWithMeta[] = [
  {
    id: 'mock-1',
    name: 'Pop Culture',
    author: null,
    description: null,
    defaultTimeLimit: 15,
    tags: ['pop culture'],
    questionCount: 3,
    isMeta: false,
    availableInCasual: true,
    language: 'en',
    deletedAt: null,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'mock-2',
    name: 'World Geography',
    author: null,
    description: null,
    defaultTimeLimit: 15,
    tags: ['geography'],
    questionCount: 3,
    isMeta: false,
    availableInCasual: true,
    language: 'en',
    deletedAt: null,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'mock-3',
    name: 'Science & Nature',
    author: null,
    description: null,
    defaultTimeLimit: 15,
    tags: ['science'],
    questionCount: 4,
    isMeta: false,
    availableInCasual: true,
    language: 'en',
    deletedAt: null,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'mock-4',
    name: 'Food & Drink',
    author: null,
    description: null,
    defaultTimeLimit: 15,
    tags: ['food'],
    questionCount: 3,
    isMeta: false,
    availableInCasual: true,
    language: 'en',
    deletedAt: null,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'mock-5',
    name: 'Sports Trivia',
    author: null,
    description: null,
    defaultTimeLimit: 15,
    tags: ['sports'],
    questionCount: 3,
    isMeta: false,
    availableInCasual: true,
    language: 'en',
    deletedAt: null,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'mock-meta-1',
    name: 'All Questions',
    author: null,
    description: null,
    defaultTimeLimit: 15,
    tags: [],
    questionCount: 16,
    isMeta: true,
    availableInCasual: true,
    language: 'en',
    childSetIds: ['mock-1', 'mock-2', 'mock-3', 'mock-4', 'mock-5'],
    deletedAt: null,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'mock-meta-2',
    name: 'Party Mix',
    author: null,
    description: null,
    defaultTimeLimit: 15,
    tags: [],
    questionCount: 6,
    isMeta: true,
    availableInCasual: true,
    language: 'en',
    childSetIds: ['mock-1', 'mock-5'],
    deletedAt: null,
    createdAt: '',
    updatedAt: '',
  },
];

export const LobbyScreen: React.FC<{ bgMusic?: BgMusic }> = ({ bgMusic }) => {
  const { t, i18n } = useTranslation();
  const { state, startGame, configureGame, setLanguage, qrUrl, gameConfig, mode, serverUrl } =
    useGameController();
  const [selectedMode, setSelectedMode] = useState<'casual' | 'configured'>(
    gameConfig.gameType ?? 'casual',
  );
  const [showImportModal, setShowImportModal] = useState(false);
  const [questionSets, setQuestionSets] = useState<QuestionSetWithMeta[]>(MOCK_QUESTION_SETS);
  const [totalQuestions, setTotalQuestions] = useState(
    MOCK_QUESTION_SETS.filter((s) => !s.isMeta).reduce((sum, s) => sum + s.questionCount, 0),
  );

  const currentLanguage = i18n.language;

  const loadQuestionSets = useCallback(async () => {
    try {
      if (mode === 'local') {
        const db = getDb();
        const sets = await questionsRepo.getQuestionSets(db, currentLanguage);
        setQuestionSets(sets);
        const count = await questionsRepo.getTotalQuestionCount(db, currentLanguage);
        setTotalQuestions(count);
      } else if (mode === 'hosted' && serverUrl) {
        // Fetch sets from server API
        const host = serverUrl.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
        const res = await fetch(
          `http://${host}/api/question-sets?language=${encodeURIComponent(currentLanguage)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setQuestionSets(data.sets || []);
          const total = (data.sets || [])
            .filter((s: QuestionSetWithMeta) => !s.isMeta)
            .reduce((sum: number, s: QuestionSetWithMeta) => sum + (s.questionCount ?? 0), 0);
          setTotalQuestions(total);
        }
      }
    } catch (err) {
      console.error('Failed to load question sets:', err);
    }
  }, [mode, serverUrl, currentLanguage]);

  useEffect(() => {
    loadQuestionSets();
  }, [loadQuestionSets]);

  const handleLanguageChange = useCallback(
    (lang: SupportedLanguage) => {
      changeLanguage(lang);
      setLanguage(lang);
    },
    [setLanguage],
  );

  const handleModeChange = useCallback(
    (mode: 'casual' | 'configured') => {
      setSelectedMode(mode);
      if (mode === 'casual') {
        configureGame('casual');
      }
    },
    [configureGame],
  );

  // TV focus refs
  const casualRef = useRef<View>(null);
  const configuredRef = useRef<View>(null);
  const startRef = useRef<View>(null);
  const enRef = useRef<View>(null);
  const [focusTags, setFocusTags] = useState<{
    configured?: number;
    start?: number;
    en?: number;
  }>({});

  useEffect(() => {
    const timer = setTimeout(() => {
      setFocusTags({
        configured: findNodeHandle(configuredRef.current) ?? undefined,
        start: findNodeHandle(startRef.current) ?? undefined,
        en: findNodeHandle(enRef.current) ?? undefined,
      });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const players = playersSelectors.selectAll(state.players);
  const playerCount = players.length;
  const canStart = playerCount >= state.game.config.minPlayers;

  return (
    <ScreenBackground style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('lobby.title')}</Text>
        <View style={styles.headerControls}>
          {bgMusic?.hasTracks && (
            <Pressable
              onPress={bgMusic.toggleMute}
              style={(state) => [
                styles.muteButton,
                (state as any).focused && styles.focused,
                state.pressed && styles.pressed,
              ]}
            >
              <Text style={styles.muteButtonText}>
                {bgMusic.isMuted ? '\u{1F507}' : '\u{1F50A}'}
              </Text>
            </Pressable>
          )}
          <View style={styles.languageSwitcher}>
            {LANGUAGES.map((lang) => (
              <Pressable
                key={lang.code}
                ref={lang.code === 'en' ? enRef : undefined}
                onPress={() => handleLanguageChange(lang.code)}
                nextFocusDown={focusTags.start}
                style={(state) => [
                  styles.languageButton,
                  i18n.language === lang.code && styles.languageButtonActive,
                  (state as any).focused && styles.focused,
                  (state as any).focused && styles.focusedScale,
                  state.pressed && styles.pressed,
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
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.content}>
        {/* Players Section */}
        <View style={styles.playersSection}>
          <Card style={styles.playersCard}>
            <Text style={styles.playersTitle}>
              {playerCount === 0
                ? t('lobby.waitingForPlayers')
                : t('lobby.playersJoined', { count: playerCount })}
            </Text>

            <View style={styles.playersList}>
              {players.slice(0, playerCount > 7 ? 6 : 7).map((player) => (
                <PlayerAvatar
                  key={player.id}
                  name={player.name}
                  color={player.color}
                  emoji={player.emoji}
                  size="small"
                />
              ))}
              {playerCount > 7 && (
                <View style={styles.overflowBadge}>
                  <Text style={styles.overflowText}>+{playerCount - 6}</Text>
                </View>
              )}
              {players.length === 0 && (
                <Text style={styles.waitingText}>{t('lobby.scanQrToJoin')}</Text>
              )}
            </View>
          </Card>

          {/* Game Mode Selector */}
          <View style={styles.gameModeContainer}>
            <View style={styles.gameModeHeader}>
              <Text style={styles.gameModeLabel}>{t('gameConfig.gameMode')}</Text>
              <Text style={styles.questionCount}>
                {t('gameConfig.totalQuestions', { count: totalQuestions })}
              </Text>
            </View>
            <View style={styles.gameModeButtons}>
              <Pressable
                ref={casualRef}
                hasTVPreferredFocus
                onPress={() => handleModeChange('casual')}
                style={(state) => [
                  styles.gameModeButton,
                  selectedMode === 'casual' && styles.gameModeButtonActive,
                  (state as any).focused && styles.focused,
                  state.pressed && styles.pressed,
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
              </Pressable>
              <Pressable
                ref={configuredRef}
                onPress={() => handleModeChange('configured')}
                nextFocusRight={focusTags.start}
                style={(state) => [
                  styles.gameModeButton,
                  selectedMode === 'configured' && styles.gameModeButtonActive,
                  (state as any).focused && styles.focused,
                  state.pressed && styles.pressed,
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
              </Pressable>
              {mode === 'local' && (
                <Pressable
                  onPress={() => setShowImportModal(true)}
                  style={(state) => [
                    styles.importButton,
                    (state as any).focused && styles.focused,
                    state.pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.importButtonText}>{t('gameConfig.importQuestions')}</Text>
                </Pressable>
              )}
            </View>

            {/* Question Set Picker (configured mode) */}
            {selectedMode === 'configured' && (
              <ScrollView
                horizontal
                style={styles.setPickerContainer}
                contentContainerStyle={styles.setPickerContent}
                showsHorizontalScrollIndicator={false}
              >
                {questionSets.length === 0 ? (
                  <Text style={styles.noSetsText}>{t('gameConfig.noSets')}</Text>
                ) : (
                  [...questionSets]
                    .sort((a, b) => Number(b.isMeta) - Number(a.isMeta))
                    .map((set) => (
                      <Pressable
                        key={set.id}
                        onPress={() => configureGame('configured', set.id)}
                        nextFocusRight={focusTags.start}
                        style={(pressState) => [
                          styles.setCard,
                          set.isMeta && styles.setCardMeta,
                          gameConfig.questionSetId === set.id && styles.setCardActive,
                          (pressState as any).focused && styles.focused,
                          pressState.pressed && styles.pressed,
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
                          {set.isMeta
                            ? t('gameConfig.questionsCount', { count: set.questionCount })
                            : t('gameConfig.questionsCount', { count: set.questionCount })}
                        </Text>
                      </Pressable>
                    ))
                )}
              </ScrollView>
            )}
          </View>
        </View>

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
              </>
            ) : (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>{t('lobby.serverStarting')}</Text>
              </View>
            )}
          </Card>

          {/* Start Button */}
          <View style={styles.startButtonContainer}>
            <Button
              ref={startRef}
              title={t('lobby.startGame')}
              onPress={startGame}
              disabled={!canStart}
              size="large"
              style={styles.startButton}
              nextFocusLeft={focusTags.configured}
              nextFocusUp={focusTags.en}
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
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.displayMedium,
    color: colors.primary,
  },
  headerControls: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  muteButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.textSecondary,
  },
  muteButtonText: {
    fontSize: 20,
  },
  languageSwitcher: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  languageButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 2,
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
    gap: spacing.xl,
  },
  qrSection: {
    flex: 0.35,
    justifyContent: 'flex-start',
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
    flex: 0.65,
  },
  playersCard: {
    padding: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 120,
  },
  playersTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  playersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 48,
    alignItems: 'center',
  },
  overflowBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overflowText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  waitingText: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  gameModeContainer: {
    marginBottom: spacing.md,
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
    borderWidth: 2,
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
    borderWidth: 2,
    borderColor: colors.textSecondary,
    minWidth: 120,
  },
  setCardMeta: {
    borderStyle: 'dashed',
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
    borderWidth: 2,
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
    marginTop: spacing.lg,
  },
  startButton: {
    minWidth: 260,
  },
  hintText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  focused: {
    borderColor: colors.primary,
  },
  focusedScale: {
    transform: [{ scale: 1.1 }],
  },
  pressed: {
    opacity: 0.8,
  },
});
