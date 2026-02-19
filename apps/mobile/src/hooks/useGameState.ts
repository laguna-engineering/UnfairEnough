import type { SupportedLanguage } from '@unfairenough/i18n';
import { changeLanguage } from '@unfairenough/i18n';
import type {
  AnswerKey,
  GameResult,
  IdentityPayload,
  MediaPreviewPayload,
  Question,
  RoundResult,
  WelcomePayload,
} from '@unfairenough/ws-protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { clearDeviceId, getDeviceId } from '../services/deviceId';
import { wsClient } from '../services/WebSocketClient';

export type MobileGamePhase =
  | 'SCAN'
  | 'IDENTIFYING'
  | 'WELCOME_BACK'
  | 'JOIN'
  | 'WAITING'
  | 'COUNTDOWN'
  | 'MEDIA_PREVIEW'
  | 'PLAYING'
  | 'ANSWERED'
  | 'RESULT'
  | 'GAME_OVER';

export function useGameState() {
  const [phase, setPhase] = useState<MobileGamePhase>('SCAN');
  const [connectionState, setConnectionState] = useState<
    'disconnected' | 'connecting' | 'connected'
  >('disconnected');
  const [playerInfo, setPlayerInfo] = useState<WelcomePayload | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<
    (Question & { serverTimestamp: number }) | null
  >(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<AnswerKey | null>(null);
  const [confirmedAnswer, setConfirmedAnswer] = useState<AnswerKey | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [mediaPreview, setMediaPreview] = useState<MediaPreviewPayload | null>(null);
  const [identifiedProfile, setIdentifiedProfile] = useState<IdentityPayload['profile'] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const languageOverridden = useRef(false);

  useEffect(() => {
    wsClient.setCallbacks({
      onConnectionStateChange: setConnectionState,
      onIdentity: (data) => {
        if (data.profile) {
          setIdentifiedProfile(data.profile);
          setPhase('WELCOME_BACK');
        } else {
          setIdentifiedProfile(null);
          setPhase('JOIN');
        }
      },
      onWelcome: (data) => {
        setPlayerInfo(data);
        setPhase('WAITING');
        setError(null);
        // Apply host's language unless the player has manually overridden it
        if (data.language && !languageOverridden.current) {
          changeLanguage(data.language as SupportedLanguage);
        }
      },
      onGameStarting: (count) => {
        setPhase('COUNTDOWN');
        setCountdown(count);
      },
      onMediaPreview: (data) => {
        setPhase('MEDIA_PREVIEW');
        setMediaPreview(data);
      },
      onQuestion: (question) => {
        setPhase('PLAYING');
        setCurrentQuestion(question);
        setTimeRemaining(question.timeLimit);
        setSelectedAnswer(null);
        setConfirmedAnswer(null);
        setMediaPreview(null);
      },
      onTick: (remaining) => {
        setTimeRemaining(remaining);
      },
      onAnswerAck: () => {
        setPhase('ANSWERED');
      },
      onRoundEnd: (result) => {
        setPhase('RESULT');
        setRoundResult(result);
      },
      onGameOver: (result) => {
        setPhase('GAME_OVER');
        setGameResult(result);
      },
      onError: (err) => {
        setError(err.message);
      },
    });

    return () => {
      wsClient.disconnect();
    };
  }, []);

  const connect = useCallback((url: string) => {
    const deviceId = getDeviceId() ?? undefined;
    wsClient.connect(url, deviceId);
    setPhase('IDENTIFYING');
  }, []);

  const join = useCallback((name: string, roomCode?: string, deviceId?: string) => {
    wsClient.join(name, roomCode, deviceId);
  }, []);

  const confirmIdentity = useCallback(() => {
    if (!identifiedProfile) return;
    const deviceId = getDeviceId() ?? undefined;
    wsClient.join(identifiedProfile.displayName, undefined, deviceId);
  }, [identifiedProfile]);

  const rejectIdentity = useCallback(async () => {
    await clearDeviceId();
    setIdentifiedProfile(null);
    setPhase('JOIN');
  }, []);

  const submitAnswer = useCallback(
    (answer: AnswerKey) => {
      if (confirmedAnswer || !currentQuestion) return;
      setSelectedAnswer(answer);
      setConfirmedAnswer(answer);
      wsClient.sendAnswer(currentQuestion.id, answer);
    },
    [confirmedAnswer, currentQuestion],
  );

  const reset = useCallback(() => {
    wsClient.disconnect();
    setPhase('SCAN');
    setPlayerInfo(null);
    setIdentifiedProfile(null);
    setCurrentQuestion(null);
    setSelectedAnswer(null);
    setConfirmedAnswer(null);
    setRoundResult(null);
    setGameResult(null);
    setMediaPreview(null);
    setError(null);
    languageOverridden.current = false;
  }, []);

  const setLanguageOverride = useCallback((lang: SupportedLanguage) => {
    languageOverridden.current = true;
    changeLanguage(lang);
  }, []);

  return {
    phase,
    connectionState,
    playerInfo,
    identifiedProfile,
    countdown,
    currentQuestion,
    timeRemaining,
    selectedAnswer,
    confirmedAnswer,
    roundResult,
    gameResult,
    mediaPreview,
    error,
    connect,
    join,
    confirmIdentity,
    rejectIdentity,
    submitAnswer,
    reset,
    setLanguageOverride,
  };
}
