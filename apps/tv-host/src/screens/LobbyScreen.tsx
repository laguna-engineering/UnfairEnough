import { type QuestionSetWithMeta, questionsRepo } from '@unfairenough/db';
import { playersSelectors } from '@unfairenough/game-logic';
import { changeLanguage, type SupportedLanguage, useTranslation } from '@unfairenough/i18n';
import {
  Button,
  borderRadius,
  Card,
  PlayerAvatar,
  ScreenBackground,
  spacing,
  type ThemeTokens,
  tvSafeArea,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findNodeHandle, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useGameController } from '../hooks/useGameController';
import { getCachedAuthState } from '../services/AuthService';
import { getDb } from '../services/database';
import { APP_VERSION } from '../version';
import { ImportQuestionsModal } from './ImportQuestionsModal';

const QR_SIZE = 150;

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

type GameModeType = 'casual' | 'configured' | 'personalized';

interface TagWithCount {
  tag: string;
  questionCount: number;
}

export const LobbyScreen: React.FC<{ bgMusic?: BgMusic }> = ({ bgMusic }) => {
  const { t, i18n } = useTranslation();
  const { theme, mode: themeMode, toggle: toggleTheme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const {
    state,
    startGame,
    configureGame,
    setLanguage,
    qrUrl,
    gameConfig,
    mode,
    serverUrl,
    roomCode,
  } = useGameController();
  const [selectedMode, setSelectedMode] = useState<GameModeType>(gameConfig.gameType ?? 'casual');
  const [showImportModal, setShowImportModal] = useState(false);
  const [questionSets, setQuestionSets] = useState<QuestionSetWithMeta[]>(MOCK_QUESTION_SETS);
  const [totalQuestions, setTotalQuestions] = useState(
    MOCK_QUESTION_SETS.filter((s) => !s.isMeta).reduce((sum, s) => sum + s.questionCount, 0),
  );

  // Personalized mode local state — restore from gameConfig when returning to lobby
  const [availableTags, setAvailableTags] = useState<TagWithCount[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(gameConfig.tags ?? []);
  const [customTotalQuestions, setCustomTotalQuestions] = useState(
    gameConfig.gameType === 'personalized' ? gameConfig.totalQuestions : 10,
  );
  const [customTimeLimit, setCustomTimeLimit] = useState(
    gameConfig.gameType === 'personalized' ? gameConfig.questionTimeLimit : 15,
  );
  const [adaptiveEnabled, setAdaptiveEnabled] = useState(gameConfig.adaptiveMode ?? true);

  const currentLanguage = i18n.language;
  const serverHost = serverUrl?.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '') ?? '';

  const loadQuestionSets = useCallback(async () => {
    try {
      if (mode === 'local') {
        const db = getDb();
        const sets = await questionsRepo.getQuestionSets(db, null, currentLanguage);
        setQuestionSets(sets);
        const count = await questionsRepo.getTotalQuestionCount(db, currentLanguage);
        setTotalQuestions(count);
      } else if (mode === 'hosted' && serverUrl) {
        // Fetch sets from server API
        const isSecure = /^https:\/\/|^wss:\/\//.test(serverUrl);
        const host = serverUrl.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
        const proto = isSecure ? 'https' : 'http';
        const auth = getCachedAuthState();
        const headers: Record<string, string> = {};
        if (auth?.sessionToken) {
          headers.Authorization = `Bearer ${auth.sessionToken}`;
        }
        const res = await fetch(
          `${proto}://${host}/api/question-sets?language=${encodeURIComponent(currentLanguage)}`,
          { headers },
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

  // Load the tag list for the personalized-mode picker. Same predicate as the game
  // pool (host + language scoped) so displayed counts match what a game loads.
  const loadTags = useCallback(async () => {
    try {
      if (mode === 'local') {
        const db = getDb();
        const tags = await questionsRepo.getTagsWithCounts(db, null, currentLanguage);
        setAvailableTags(tags);
      } else if (mode === 'hosted' && serverUrl) {
        const isSecure = /^https:\/\/|^wss:\/\//.test(serverUrl);
        const host = serverUrl.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
        const proto = isSecure ? 'https' : 'http';
        const auth = getCachedAuthState();
        const headers: Record<string, string> = {};
        if (auth?.sessionToken) {
          headers.Authorization = `Bearer ${auth.sessionToken}`;
        }
        const res = await fetch(
          `${proto}://${host}/api/tags?language=${encodeURIComponent(currentLanguage)}`,
          { headers },
        );
        if (res.ok) {
          const data = await res.json();
          // /api/tags unions in player-score tags that may have no questions
          // (questionCount 0). Drop them: a 0-question chip would be selectable
          // and enable Start, but the server rejects the config (NO_QUESTIONS_FOR_TAGS),
          // silently falling back to a casual game. The local picker can't produce these.
          setAvailableTags(
            (data.tags || [])
              .map((tRow: { tag: string; questionCount: number }) => ({
                tag: tRow.tag,
                questionCount: tRow.questionCount,
              }))
              .filter((tRow: TagWithCount) => tRow.questionCount > 0),
          );
        }
      }
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  }, [mode, serverUrl, currentLanguage]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  // Sync the server room's language to the app language once connected.
  // The room (hosted) and local WS server both default to 'en' and were only
  // told the real language on a *manual* toggle. A host running the app in
  // another language (e.g. Italian) would therefore have their personalized
  // tag config validated against 'en', match zero questions, and silently fall
  // back to a 10-question casual game. `roomCode` gates on a live connection so
  // the message isn't dropped before the socket is open.
  useEffect(() => {
    if (roomCode) {
      setLanguage(currentLanguage);
    }
  }, [roomCode, currentLanguage, setLanguage]);

  // Clear personalized tag selection on language change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on language change
  useEffect(() => {
    setSelectedTags([]);
  }, [currentLanguage]);

  const handleLanguageChange = useCallback(
    (lang: SupportedLanguage) => {
      changeLanguage(lang);
      setLanguage(lang);
    },
    [setLanguage],
  );

  // Soft upper bound: sum of selected tags' counts. The real union pool may be
  // smaller (a question with two selected tags is counted once server-side), so
  // the controller/server clamps totalQuestions down to the actual pool size.
  const maxCustomQuestions = availableTags
    .filter((tRow) => selectedTags.includes(tRow.tag))
    .reduce((sum, tRow) => sum + tRow.questionCount, 0);

  // Send personalized config whenever the tag selection or settings change
  const sendPersonalizedConfig = useCallback(
    (tags: string[], total: number, timeLimit: number, adaptive: boolean) => {
      if (tags.length > 0) {
        configureGame('personalized', undefined, {
          tags,
          totalQuestions: total,
          questionTimeLimit: timeLimit,
          adaptiveMode: adaptive,
        });
      }
    },
    [configureGame],
  );

  const handleModeChange = useCallback(
    (newMode: GameModeType) => {
      setSelectedMode(newMode);
      if (newMode === 'casual') {
        configureGame('casual');
      } else if (newMode === 'personalized' && selectedTags.length > 0) {
        sendPersonalizedConfig(
          selectedTags,
          customTotalQuestions,
          customTimeLimit,
          adaptiveEnabled,
        );
      }
      // 'configured' mode waits for set selection
    },
    [
      configureGame,
      selectedTags,
      customTotalQuestions,
      customTimeLimit,
      adaptiveEnabled,
      sendPersonalizedConfig,
    ],
  );

  const handleToggleTag = useCallback(
    (tag: string) => {
      setSelectedTags((prev) => {
        const next = prev.includes(tag) ? prev.filter((tRow) => tRow !== tag) : [...prev, tag];

        // Recompute max from new selection
        const newMax = availableTags
          .filter((tRow) => next.includes(tRow.tag))
          .reduce((sum, tRow) => sum + tRow.questionCount, 0);

        // Auto-clamp totalQuestions
        const clamped = Math.min(customTotalQuestions, newMax) || newMax;
        setCustomTotalQuestions(clamped > 0 ? clamped : 1);

        if (next.length > 0) {
          sendPersonalizedConfig(
            next,
            Math.min(customTotalQuestions, newMax) || newMax,
            customTimeLimit,
            adaptiveEnabled,
          );
        }
        return next;
      });
    },
    [availableTags, customTotalQuestions, customTimeLimit, adaptiveEnabled, sendPersonalizedConfig],
  );

  const handleResetTags = useCallback(() => {
    setSelectedTags([]);
  }, []);

  const handleTotalQuestionsChange = useCallback(
    (delta: number) => {
      setCustomTotalQuestions((prev) => {
        const next = Math.max(1, Math.min(prev + delta, maxCustomQuestions));
        sendPersonalizedConfig(selectedTags, next, customTimeLimit, adaptiveEnabled);
        return next;
      });
    },
    [maxCustomQuestions, selectedTags, customTimeLimit, adaptiveEnabled, sendPersonalizedConfig],
  );

  const handleTimeLimitChange = useCallback(
    (delta: number) => {
      setCustomTimeLimit((prev) => {
        const next = Math.max(5, Math.min(prev + delta, 60));
        sendPersonalizedConfig(selectedTags, customTotalQuestions, next, adaptiveEnabled);
        return next;
      });
    },
    [selectedTags, customTotalQuestions, adaptiveEnabled, sendPersonalizedConfig],
  );

  const handleAdaptiveToggle = useCallback(() => {
    setAdaptiveEnabled((prev) => {
      const next = !prev;
      sendPersonalizedConfig(selectedTags, customTotalQuestions, customTimeLimit, next);
      return next;
    });
  }, [selectedTags, customTotalQuestions, customTimeLimit, sendPersonalizedConfig]);

  // TV focus refs
  const casualRef = useRef<View>(null);
  const personalizedRef = useRef<View>(null);
  // Typed off Button (not bare View): tv-host resolves `react-native` to its
  // nested tvOS copy while packages/ui uses the root copy, so a bare useRef<View>
  // is nominally incompatible with Button's ref.
  const startRef = useRef<React.ComponentRef<typeof Button>>(null);
  const enRef = useRef<View>(null);
  const muteRef = useRef<View>(null);
  const themeRef = useRef<View>(null);
  const [focusTags, setFocusTags] = useState<{
    personalized?: number;
    start?: number;
    en?: number;
    mute?: number;
    theme?: number;
  }>({});

  const players = playersSelectors.selectAll(state.players);
  const playerCount = players.length;
  const canStart =
    playerCount >= state.game.config.minPlayers &&
    (selectedMode !== 'personalized' || selectedTags.length > 0);

  // Capture focus-target node handles after layout. Keyed on canStart because the
  // Start button swaps native nodes between its disabled and enabled (gradient)
  // renders — re-running keeps the `start` handle fresh once players join.
  // biome-ignore lint/correctness/useExhaustiveDependencies: canStart is an intentional re-run trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      setFocusTags({
        personalized: findNodeHandle(personalizedRef.current) ?? undefined,
        start: findNodeHandle(startRef.current) ?? undefined,
        en: findNodeHandle(enRef.current) ?? undefined,
        mute: findNodeHandle(muteRef.current) ?? undefined,
        theme: findNodeHandle(themeRef.current) ?? undefined,
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [canStart]);

  return (
    <ScreenBackground style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('lobby.title')}</Text>
        <View style={styles.headerControls}>
          <Pressable
            ref={themeRef}
            onPress={toggleTheme}
            nextFocusDown={focusTags.start}
            nextFocusRight={focusTags.mute ?? focusTags.en}
            style={(state) => [
              styles.muteButton,
              (state as any).focused && styles.focused,
              state.pressed && styles.pressed,
            ]}
          >
            <Text style={styles.muteButtonText}>{themeMode === 'dark' ? '☀️' : '\u{1F319}'}</Text>
          </Pressable>
          {bgMusic?.hasTracks && (
            <Pressable
              ref={muteRef}
              onPress={bgMusic.toggleMute}
              nextFocusLeft={focusTags.theme ?? focusTags.start}
              nextFocusRight={focusTags.en}
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
                nextFocusLeft={lang.code === 'en' ? (focusTags.mute ?? focusTags.start) : undefined}
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
            <View style={styles.playersHeaderRow}>
              <Text style={styles.playersTitle}>
                {playerCount === 0
                  ? t('lobby.waitingForPlayers')
                  : t('lobby.playersJoined', { count: playerCount })}
              </Text>

              <View style={styles.startButtonContainer}>
                <Button
                  ref={startRef}
                  title={t('lobby.startGame')}
                  onPress={startGame}
                  disabled={!canStart}
                  size="medium"
                  style={styles.startButton}
                  nextFocusRight={focusTags.mute ?? focusTags.en}
                />
                {!canStart && playerCount > 0 && selectedMode !== 'personalized' && (
                  <Text style={styles.hintText}>
                    {t('lobby.needMorePlayers', { min: state.game.config.minPlayers })}
                  </Text>
                )}
                {selectedMode === 'personalized' && selectedTags.length === 0 && (
                  <Text style={styles.hintText}>{t('gameConfig.selectTags')}</Text>
                )}
                {state.game.configError && (
                  <Text style={styles.configErrorText}>{state.game.configError}</Text>
                )}
              </View>
            </View>

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
                <Text style={styles.waitingText}>{t('lobby.scanToJoin')}</Text>
              )}
            </View>
          </Card>

          {/* Game Mode Selector */}
          <View style={styles.gameModeContainer}>
            <View style={styles.gameModeHeader}>
              <Text style={styles.gameModeLabel}>{t('gameConfig.gameMode')}</Text>
              <Text style={styles.questionCount}>
                {t('gameConfig.totalQuestions', {
                  count: selectedMode === 'personalized' ? maxCustomQuestions : totalQuestions,
                })}
              </Text>
            </View>
            <View style={styles.gameModeButtons}>
              <Pressable
                ref={casualRef}
                hasTVPreferredFocus={selectedMode === 'casual'}
                onPress={() => handleModeChange('casual')}
                nextFocusUp={focusTags.start}
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
                hasTVPreferredFocus={selectedMode === 'configured'}
                onPress={() => handleModeChange('configured')}
                nextFocusUp={focusTags.start}
                nextFocusRight={focusTags.personalized}
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
              <Pressable
                ref={personalizedRef}
                hasTVPreferredFocus={selectedMode === 'personalized'}
                onPress={() => handleModeChange('personalized')}
                nextFocusUp={focusTags.start}
                style={(state) => [
                  styles.gameModeButton,
                  selectedMode === 'personalized' && styles.gameModeButtonActive,
                  (state as any).focused && styles.focused,
                  state.pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.gameModeButtonText,
                    selectedMode === 'personalized' && styles.gameModeButtonTextActive,
                  ]}
                >
                  {t('gameConfig.personalized')}
                </Text>
              </Pressable>
            </View>
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
                          {t('gameConfig.questionsCount', { count: set.questionCount })}
                        </Text>
                      </Pressable>
                    ))
                )}
              </ScrollView>
            )}

            {/* Personalized Mode Controls */}
            {selectedMode === 'personalized' && (
              <View style={styles.customControls}>
                {/* Multi-select tag picker */}
                <ScrollView
                  horizontal
                  style={styles.setPickerContainer}
                  contentContainerStyle={styles.setPickerContent}
                  showsHorizontalScrollIndicator={false}
                >
                  {availableTags.length === 0 ? (
                    <Text style={styles.noSetsText}>{t('gameConfig.noTags')}</Text>
                  ) : (
                    <>
                      <Pressable
                        disabled={selectedTags.length === 0}
                        onPress={handleResetTags}
                        style={(pressState) => [
                          styles.setCard,
                          styles.resetCard,
                          selectedTags.length === 0 && styles.resetCardDisabled,
                          (pressState as any).focused && styles.focused,
                          pressState.pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.setCardName,
                            selectedTags.length === 0 && styles.resetCardTextDisabled,
                          ]}
                          numberOfLines={1}
                        >
                          {t('gameConfig.resetTags')}
                        </Text>
                      </Pressable>
                      {availableTags.map((tagRow) => (
                        <Pressable
                          key={tagRow.tag}
                          onPress={() => handleToggleTag(tagRow.tag)}
                          nextFocusRight={focusTags.start}
                          style={(pressState) => [
                            styles.setCard,
                            selectedTags.includes(tagRow.tag) && styles.setCardActive,
                            (pressState as any).focused && styles.focused,
                            pressState.pressed && styles.pressed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.setCardName,
                              selectedTags.includes(tagRow.tag) && styles.setCardNameActive,
                            ]}
                            numberOfLines={1}
                          >
                            {tagRow.tag}
                          </Text>
                          <Text style={styles.setCardCount}>
                            {t('gameConfig.questionsCount', { count: tagRow.questionCount })}
                          </Text>
                        </Pressable>
                      ))}
                    </>
                  )}
                </ScrollView>

                {selectedTags.length === 0 ? (
                  <Text style={styles.selectSetsHint}>{t('gameConfig.selectTags')}</Text>
                ) : (
                  <View style={styles.customSettingsRow}>
                    {/* Total questions stepper */}
                    <View style={styles.stepperGroup}>
                      <Text style={styles.stepperLabel}>{t('gameConfig.totalQuestionsLabel')}</Text>
                      <View style={styles.stepper}>
                        <Pressable
                          onPress={() => handleTotalQuestionsChange(-1)}
                          style={(s) => [
                            styles.stepperButton,
                            (s as any).focused && styles.focused,
                            s.pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.stepperButtonText}>-</Text>
                        </Pressable>
                        <Text style={styles.stepperValue}>{customTotalQuestions}</Text>
                        <Pressable
                          onPress={() => handleTotalQuestionsChange(1)}
                          style={(s) => [
                            styles.stepperButton,
                            (s as any).focused && styles.focused,
                            s.pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.stepperButtonText}>+</Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* Seconds per question stepper */}
                    <View style={styles.stepperGroup}>
                      <Text style={styles.stepperLabel}>{t('gameConfig.secondsPerQuestion')}</Text>
                      <View style={styles.stepper}>
                        <Pressable
                          onPress={() => handleTimeLimitChange(-5)}
                          style={(s) => [
                            styles.stepperButton,
                            (s as any).focused && styles.focused,
                            s.pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.stepperButtonText}>-</Text>
                        </Pressable>
                        <Text style={styles.stepperValue}>{customTimeLimit}</Text>
                        <Pressable
                          onPress={() => handleTimeLimitChange(5)}
                          style={(s) => [
                            styles.stepperButton,
                            (s as any).focused && styles.focused,
                            s.pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.stepperButtonText}>+</Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* Adaptive mode toggle */}
                    <View style={styles.stepperGroup}>
                      <Text style={styles.stepperLabel}>{t('gameConfig.adaptiveMode')}</Text>
                      <Pressable
                        onPress={handleAdaptiveToggle}
                        style={(s) => [
                          styles.toggleButton,
                          adaptiveEnabled && styles.toggleButtonActive,
                          (s as any).focused && styles.focused,
                          s.pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.toggleButtonText,
                            adaptiveEnabled && styles.toggleButtonTextActive,
                          ]}
                        >
                          {adaptiveEnabled ? 'ON' : 'OFF'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* QR Code Section */}
        <View style={styles.qrSection}>
          <Card style={styles.qrCard} variant="glow" glowColor={theme.accent}>
            {qrUrl ? (
              <View style={styles.qrContainer}>
                <QRCode value={qrUrl} size={QR_SIZE} backgroundColor="white" color="#0d0f1a" />
              </View>
            ) : (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>{t('lobby.serverStarting')}</Text>
              </View>
            )}
          </Card>

          {qrUrl ? <Text style={styles.qrCaption}>{t('lobby.scanQrToJoin')}</Text> : null}

          {mode === 'hosted' && roomCode ? (
            <View style={styles.manualJoin}>
              <Text style={styles.qrCaption}>{t('lobby.orVisitUrl', { url: serverHost })}</Text>
              <Text style={styles.manualJoinCode}>{roomCode}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {mode === 'local' && (
        <ImportQuestionsModal
          visible={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImported={loadQuestionSets}
        />
      )}

      <Text style={styles.version}>v{APP_VERSION}</Text>
    </ScreenBackground>
  );
};

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.md,
      paddingBottom: tvSafeArea.vertical,
    },
    // Bottom-right corner, inside the TV safe area so it isn't cropped by overscan.
    version: {
      ...typography.bodySmall,
      color: t.inkSoft,
      opacity: 0.5,
      position: 'absolute',
      right: spacing.xxl,
      bottom: spacing.md,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    title: {
      ...typography.displayLarge,
      fontSize: 48,
      lineHeight: 56,
      color: t.title,
    },
    headerControls: {
      position: 'absolute',
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    muteButton: {
      width: 56,
      height: 56,
      borderRadius: borderRadius.md,
      borderWidth: 2,
      borderColor: t.cardBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    muteButtonText: {
      fontSize: 24,
    },
    languageSwitcher: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    languageButton: {
      minWidth: 56,
      height: 56,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 2,
      borderColor: t.cardBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    languageButtonActive: {
      backgroundColor: t.cta,
      borderColor: t.cta,
    },
    languageButtonText: {
      ...typography.label,
      color: t.inkSoft,
    },
    languageButtonTextActive: {
      color: t.ctaInk,
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
      padding: spacing.md,
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
      color: t.inkSoft,
    },
    qrCaption: {
      ...typography.body,
      color: t.inkSoft,
      marginTop: spacing.sm,
      textAlign: 'center',
      maxWidth: 280,
    },
    manualJoin: {
      marginTop: spacing.sm,
      alignItems: 'center',
    },
    manualJoinCode: {
      ...typography.h2,
      color: t.title,
      fontWeight: '700',
      letterSpacing: 4,
      marginTop: spacing.xs,
    },
    playersSection: {
      flex: 0.65,
    },
    playersCard: {
      padding: spacing.md,
      marginBottom: spacing.xl,
      height: 150,
    },
    playersHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.lg,
      marginBottom: spacing.xs,
    },
    playersTitle: {
      ...typography.h2,
      color: t.ink,
    },
    playersList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: -spacing.sm,
      paddingVertical: spacing.xs,
      minHeight: 48,
      alignItems: 'center',
    },
    overflowBadge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: t.card,
      justifyContent: 'center',
      alignItems: 'center',
    },
    overflowText: {
      ...typography.label,
      color: t.inkSoft,
    },
    waitingText: {
      ...typography.body,
      color: t.inkSoft,
      fontStyle: 'italic',
    },
    gameModeContainer: {
      marginBottom: spacing.sm,
    },
    gameModeHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    gameModeLabel: {
      ...typography.label,
      color: t.inkSoft,
    },
    questionCount: {
      ...typography.bodySmall,
      color: t.inkSoft,
    },
    gameModeButtons: {
      flexDirection: 'row',
      backgroundColor: t.segTrack,
      borderRadius: borderRadius.lg,
      padding: spacing.xs,
    },
    importButton: {
      alignSelf: 'flex-start',
      marginTop: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 2,
      borderColor: t.accent,
      borderStyle: 'dashed',
    },
    importButtonText: {
      ...typography.body,
      color: t.accent,
    },
    setPickerContainer: {
      marginTop: spacing.xs,
    },
    setPickerContent: {
      gap: spacing.sm,
      paddingRight: spacing.sm,
    },
    setCard: {
      backgroundColor: t.card,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.lg,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
      minWidth: 150,
    },
    setCardMeta: {
      borderStyle: 'dashed',
    },
    setCardActive: {
      backgroundColor: t.accentSoft,
      borderColor: 'transparent',
    },
    resetCard: {
      minWidth: 90,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resetCardDisabled: {
      opacity: 0.4,
    },
    resetCardTextDisabled: {
      color: t.inkSoft,
    },
    setCardName: {
      ...typography.body,
      color: t.ink,
      fontWeight: '700',
    },
    setCardNameActive: {
      color: t.accentInk,
    },
    setCardCount: {
      ...typography.bodySmall,
      color: t.inkSoft,
    },
    noSetsText: {
      ...typography.bodySmall,
      color: t.inkSoft,
      fontStyle: 'italic',
      paddingVertical: spacing.sm,
    },
    gameModeButton: {
      flex: 1,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 2,
      borderColor: 'transparent',
      alignItems: 'center',
    },
    gameModeButtonActive: {
      backgroundColor: t.cta,
    },
    gameModeButtonText: {
      ...typography.body,
      color: t.inkSoft,
      fontWeight: '700',
    },
    gameModeButtonTextActive: {
      color: t.ctaInk,
      fontWeight: '700',
    },
    // Custom mode controls
    customControls: {
      marginTop: spacing.xs,
    },
    selectSetsHint: {
      ...typography.bodySmall,
      color: t.inkSoft,
      fontStyle: 'italic',
      marginTop: spacing.sm,
    },
    customSettingsRow: {
      flexDirection: 'row',
      gap: spacing.lg,
      marginTop: spacing.xs,
      alignItems: 'flex-start',
    },
    stepperGroup: {
      alignItems: 'center',
    },
    stepperLabel: {
      ...typography.bodySmall,
      color: t.inkSoft,
      fontWeight: '700',
      textAlign: 'left',
      alignSelf: 'flex-start',
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    stepperButton: {
      width: 46,
      height: 46,
      borderRadius: borderRadius.md,
      borderWidth: 2,
      borderColor: t.cardBorder,
      backgroundColor: t.card,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepperButtonText: {
      ...typography.h3,
      color: t.inkSoft,
      fontWeight: '700',
    },
    stepperValue: {
      ...typography.h3,
      color: t.ink,
      fontWeight: '700',
      minWidth: 44,
      textAlign: 'center',
    },
    toggleButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 2,
      borderColor: t.cardBorder,
      backgroundColor: t.card,
      minWidth: 76,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toggleButtonActive: {
      backgroundColor: t.accent,
      borderColor: t.accent,
    },
    toggleButtonText: {
      ...typography.bodySmall,
      color: t.inkSoft,
      fontWeight: '700',
    },
    toggleButtonTextActive: {
      color: t.accentOn,
    },
    startButtonContainer: {
      position: 'relative',
      alignItems: 'flex-end',
    },
    startButton: {
      minWidth: 160,
    },
    hintText: {
      ...typography.bodySmall,
      color: t.inkSoft,
      position: 'absolute',
      top: '100%',
      right: 0,
      marginTop: spacing.sm,
    },
    configErrorText: {
      ...typography.bodySmall,
      color: t.error,
      position: 'absolute',
      top: '100%',
      right: 0,
      marginTop: spacing.sm,
      textAlign: 'right',
      maxWidth: 320,
    },
    focused: {
      borderColor: t.accent,
    },
    focusedScale: {
      transform: [{ scale: 1.1 }],
    },
    pressed: {
      opacity: 0.8,
    },
  });
