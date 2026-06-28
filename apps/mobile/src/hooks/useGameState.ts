import type { SupportedLanguage } from '@unfairenough/i18n';
import { changeLanguage } from '@unfairenough/i18n';
import { debugLog } from '@unfairenough/shared';
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
import { Platform } from 'react-native';
import type { GuestSession } from '../services/authStorage';
import { clearGuestSession, getGuestSession, saveGuestSession } from '../services/authStorage';
import { getDeviceId, initDeviceId } from '../services/deviceId';
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

  const getOrInitDeviceId = useCallback(async (): Promise<string | null> => {
    const cachedDeviceId = getDeviceId();
    if (cachedDeviceId) return cachedDeviceId;

    debugLog('[game-state] device id was not initialized before connect; initializing now');
    try {
      return await initDeviceId();
    } catch (err) {
      debugLog('[game-state] device id initialization failed', err);
      return null;
    }
  }, []);

  useEffect(() => {
    wsClient.setCallbacks({
      onConnectionStateChange: setConnectionState,
      onIdentity: (data) => {
        debugLog('[game-state] identity received', {
          hasProfile: !!data.profile,
          availableProfiles: data.availableProfiles?.length ?? 0,
          hasGuestSessionToken: !!data.guestSessionToken,
          hasServerUrl: !!data.serverUrl,
        });

        // If server provided a guest session token, store it for future reconnection
        if (data.guestSessionToken && data.serverUrl) {
          try {
            new URL(data.serverUrl); // Validate it's a proper URL before storing
            const profile = data.profile;
            saveGuestSession({
              sessionToken: data.guestSessionToken,
              serverUrl: data.serverUrl,
              playerName: profile?.displayName ?? '',
              playerColor: '#888',
            });
          } catch {
            // Invalid URL — skip storing the session
          }
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
        debugLog('[game-state] welcome received', {
          roomCode: data.roomCode,
          playerId: data.playerId,
          hasProfile: !!data.profile,
        });
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
        debugLog('[game-state] ws error received', err);
        setError(err.message);

        if (err.code === 'PROFILE_ALREADY_CLAIMED') {
          const deviceId = getDeviceId();
          if (deviceId) {
            setPhase('IDENTIFYING');
            wsClient.identify(deviceId);
          }
          return;
        }

        // Fatal connection errors strand the IDENTIFYING spinner — drop back to
        // the scan screen and surface the reason so the user can retry.
        if (
          err.code === 'ROOM_NOT_FOUND' ||
          err.code === 'INVALID_PARAMS' ||
          err.code === 'SESSION_INVALID'
        ) {
          setPhase('SCAN');
          if (Platform.OS === 'web') {
            alert(err.message);
          } else {
            const { Alert } = require('react-native');
            Alert.alert(err.message);
          }
        }
      },
    });

    return () => {
      wsClient.disconnect();
    };
  }, []);

  const connect = useCallback(
    (url: string, invitationToken?: string) => {
      setError(null);
      setPhase('IDENTIFYING');
      void (async () => {
        const deviceId = await getOrInitDeviceId();
        debugLog('[game-state] connect requested', {
          url,
          hasDeviceId: !!deviceId,
          hasInvitationToken: !!invitationToken,
        });

        if (!deviceId) {
          setError('Unable to initialize this device. Please restart the app and try again.');
          setPhase('SCAN');
          return;
        }

        wsClient.connect(url, deviceId, undefined, invitationToken);
      })();
    },
    [getOrInitDeviceId],
  );

  /** Connect using a stored guest session (returning user flow) */
  const connectFromSession = useCallback(
    (session: GuestSession) => {
      setReturningError(null);
      setError(null);
      setPhase('IDENTIFYING');
      void (async () => {
        const isSecure =
          session.serverUrl.startsWith('https') || session.serverUrl.startsWith('wss');
        const wsProtocol = isSecure ? 'wss:' : 'ws:';
        const host = session.serverUrl.replace(/^(https?|wss?):\/\//, '');
        const wsUrl = `${wsProtocol}//${host}/ws?role=player&roomCode=AUTO`;
        const deviceId = await getOrInitDeviceId();
        debugLog('[game-state] connect from session requested', {
          wsUrl,
          hasDeviceId: !!deviceId,
          hasSessionToken: !!session.sessionToken,
        });

        if (!deviceId) {
          const message = 'Unable to initialize this device. Please restart the app and try again.';
          setError(message);
          setReturningError(message);
          setPhase('RETURNING');
          return;
        }

        wsClient.connect(wsUrl, deviceId, session.sessionToken);
      })();
    },
    [getOrInitDeviceId],
  );

  /** Disconnect from the linked host account */
  const disconnectFromHost = useCallback(async () => {
    wsClient.disconnect();
    await clearGuestSession();
    setStoredSession(null);
    setReturningError(null);
    setPhase('SCAN');
  }, []);

  /** Dismiss the pre-game connection flow without forgetting the linked host account. */
  const cancelToScan = useCallback(() => {
    wsClient.disconnect();
    setError(null);
    setReturningError(null);
    setIdentifiedProfile(null);
    setAvailableProfiles([]);
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
    connect,
    connectFromSession,
    disconnectFromHost,
    cancelToScan,
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
