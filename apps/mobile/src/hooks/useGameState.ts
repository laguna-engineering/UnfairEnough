import type { SupportedLanguage } from '@unfairenough/i18n';
import { changeLanguage } from '@unfairenough/i18n';
import type {
  AnswerKey,
  GameResult,
  IdentityPayload,
  MediaPreviewPayload,
  ProfileSummary,
  Question,
  RoundResult,
  WelcomePayload,
} from '@unfairenough/ws-protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuestSession } from '../services/authStorage';
import { clearGuestSession, getGuestSession, saveGuestSession } from '../services/authStorage';
import { getDeviceId } from '../services/deviceId';
import { wsClient } from '../services/WebSocketClient';

export type MobileGamePhase =
  | 'RETURNING'
  | 'SCAN'
  | 'IDENTIFYING'
  | 'WELCOME_BACK'
  | 'PICK_PROFILE'
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
  const [storedSession, setStoredSession] = useState<GuestSession | null>(null);
  const [returningError, setReturningError] = useState<string | null>(null);
  const [returningConnecting, setReturningConnecting] = useState(false);
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
  const [availableProfiles, setAvailableProfiles] = useState<ProfileSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const languageOverridden = useRef(false);

  useEffect(() => {
    wsClient.setCallbacks({
      onConnectionStateChange: setConnectionState,
      onIdentity: (data) => {
        // If server provided a guest session token, store it for future reconnection
        if (data.guestSessionToken && data.serverUrl) {
          const profile = data.profile;
          saveGuestSession({
            sessionToken: data.guestSessionToken,
            serverUrl: data.serverUrl,
            playerName: profile?.displayName ?? '',
            playerColor: '#888',
          });
        }

        if (data.profile) {
          setIdentifiedProfile(data.profile);
          setAvailableProfiles([]);
          setPhase('WELCOME_BACK');
        } else if (data.availableProfiles && data.availableProfiles.length > 0) {
          setIdentifiedProfile(null);
          setAvailableProfiles(data.availableProfiles);
          setPhase('PICK_PROFILE');
        } else {
          setIdentifiedProfile(null);
          setAvailableProfiles([]);
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

  const connect = useCallback((url: string, invitationToken?: string) => {
    const deviceId = getDeviceId() ?? undefined;
    wsClient.connect(url, deviceId, undefined, invitationToken);
    setPhase('IDENTIFYING');
  }, []);

  /** Connect using a stored guest session (returning user flow) */
  const connectFromSession = useCallback((session: GuestSession) => {
    setReturningConnecting(true);
    setReturningError(null);
    const deviceId = getDeviceId() ?? undefined;
    const host = session.serverUrl.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
    // We don't know the roomCode yet — connect to the server and identify with session token
    // The server will recognize the session and provide identity
    const wsUrl = `ws://${host}/ws?role=player&roomCode=AUTO`;
    wsClient.connect(wsUrl, deviceId, session.sessionToken);
    setPhase('IDENTIFYING');
    setReturningConnecting(false);
  }, []);

  /** Disconnect from the linked host account */
  const disconnectFromHost = useCallback(async () => {
    wsClient.disconnect();
    await clearGuestSession();
    setStoredSession(null);
    setReturningError(null);
    setPhase('SCAN');
  }, []);

  const join = useCallback((name: string, roomCode?: string, deviceId?: string) => {
    wsClient.join(name, roomCode, deviceId);
  }, []);

  const confirmIdentity = useCallback(() => {
    if (!identifiedProfile) return;
    const deviceId = getDeviceId() ?? undefined;
    wsClient.join(identifiedProfile.displayName, undefined, deviceId);
  }, [identifiedProfile]);

  const claimProfile = useCallback((profileId: string, displayName: string) => {
    const deviceId = getDeviceId() ?? undefined;
    wsClient.join(displayName, undefined, deviceId, profileId);
  }, []);

  const rejectIdentity = useCallback(() => {
    const deviceId = getDeviceId();
    if (deviceId) {
      // Ask server to unbind the profile — server will respond with fresh IDENTITY
      wsClient.unbind(deviceId);
    } else {
      setIdentifiedProfile(null);
      setPhase('JOIN');
    }
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

  const goToJoin = useCallback(() => {
    setAvailableProfiles([]);
    setPhase('JOIN');
  }, []);

  const reset = useCallback(() => {
    setCurrentQuestion(null);
    setSelectedAnswer(null);
    setConfirmedAnswer(null);
    setRoundResult(null);
    setGameResult(null);
    setMediaPreview(null);
    setError(null);
    setPhase('WAITING');
  }, []);

  const setLanguageOverride = useCallback((lang: SupportedLanguage) => {
    languageOverridden.current = true;
    changeLanguage(lang);
  }, []);

  /** Check for stored session on mount. Call after initDeviceId. */
  const checkStoredSession = useCallback(async () => {
    const session = await getGuestSession();
    if (session) {
      setStoredSession(session);
      setPhase('RETURNING');
    }
  }, []);

  return {
    phase,
    connectionState,
    playerInfo,
    identifiedProfile,
    availableProfiles,
    countdown,
    currentQuestion,
    timeRemaining,
    selectedAnswer,
    confirmedAnswer,
    roundResult,
    gameResult,
    mediaPreview,
    error,
    storedSession,
    returningError,
    returningConnecting,
    connect,
    connectFromSession,
    disconnectFromHost,
    checkStoredSession,
    join,
    confirmIdentity,
    claimProfile,
    rejectIdentity,
    goToJoin,
    submitAnswer,
    reset,
    setLanguageOverride,
  };
}
