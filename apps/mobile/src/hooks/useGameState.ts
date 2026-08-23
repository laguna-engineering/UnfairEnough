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
import { initLanguagePreference, saveLanguagePreference } from '../services/languagePreference';
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
  // closest_wins / predict_room one-shot submissions. Reset per question, like confirmedAnswer.
  const [confirmedGuess, setConfirmedGuess] = useState<number | null>(null);
  const [confirmedVote, setConfirmedVote] = useState<AnswerKey | null>(null);
  const [confirmedPrediction, setConfirmedPrediction] = useState<AnswerKey | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [mediaPreview, setMediaPreview] = useState<MediaPreviewPayload | null>(null);
  const [identifiedProfile, setIdentifiedProfile] = useState<IdentityPayload['profile'] | null>(
    null,
  );
  const [availableProfiles, setAvailableProfiles] = useState<ProfileSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const languageOverridden = useRef(false);
  const connectAttemptRef = useRef(0);
  // Which ANSWER field is awaiting its ACK. predict_room's vote ack should not
  // flip the phase to ANSWERED — the player still owes a prediction (step 2).
  const pendingAckFieldRef = useRef<'answer' | 'guess' | 'vote' | 'prediction' | null>(null);

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

  // Restore the user's persisted language choice. A stored choice is an explicit
  // preference, so it also suppresses the host-pushed language on onWelcome.
  useEffect(() => {
    initLanguagePreference().then((lang) => {
      if (lang) {
        languageOverridden.current = true;
        changeLanguage(lang);
      }
    });
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
      // Reconnect catch-up: render the live phase directly instead of being
      // stranded on the waiting screen until the next broadcast.
      onStateSnapshot: (snap) => {
        debugLog('[game-state] state snapshot received', {
          phase: snap.phase,
          hasAnswered: snap.hasAnswered,
        });
        setError(null);
        switch (snap.phase) {
          case 'COUNTDOWN':
            setCountdown(snap.countdown ?? 0);
            setPhase('COUNTDOWN');
            break;
          case 'MEDIA_PREVIEW':
            if (snap.mediaPreview) {
              setMediaPreview(snap.mediaPreview);
              setPhase('MEDIA_PREVIEW');
            } else {
              setPhase('WAITING');
            }
            break;
          case 'QUESTION':
          case 'REVEALING':
            if (!snap.question) {
              setPhase('WAITING');
              break;
            }
            setCurrentQuestion(snap.question);
            setTimeRemaining(snap.question.timeLimit);
            setMediaPreview(null);
            // The snapshot only carries yourAnswer (choice types); closest_wins/
            // predict_room submissions aren't restored on reconnect — same as
            // today's behavior for those fields, just not crashing on them.
            setConfirmedGuess(null);
            setConfirmedVote(null);
            setConfirmedPrediction(null);
            pendingAckFieldRef.current = null;
            if (snap.hasAnswered || snap.phase === 'REVEALING') {
              // Already answered, or the answer window has closed — show the
              // post-answer waiting state rather than an answerable question.
              setSelectedAnswer(snap.yourAnswer ?? null);
              setConfirmedAnswer(snap.yourAnswer ?? null);
              setPhase('ANSWERED');
            } else {
              setSelectedAnswer(null);
              setConfirmedAnswer(null);
              setPhase('PLAYING');
            }
            break;
          case 'RESULTS':
            if (snap.roundResult) {
              setRoundResult(snap.roundResult);
              setPhase('RESULT');
            } else {
              setPhase('WAITING');
            }
            break;
          case 'GAME_OVER':
            if (snap.gameResult) {
              setGameResult(snap.gameResult);
              setPhase('GAME_OVER');
            } else {
              setPhase('WAITING');
            }
            break;
          default:
            setPhase('WAITING');
            break;
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
        setConfirmedGuess(null);
        setConfirmedVote(null);
        setConfirmedPrediction(null);
        pendingAckFieldRef.current = null;
        setMediaPreview(null);
      },
      onTick: (remaining) => {
        setTimeRemaining(remaining);
      },
      onAnswerAck: () => {
        const field = pendingAckFieldRef.current;
        pendingAckFieldRef.current = null;
        // predict_room's vote is step 1 of 2 — stay in PLAYING so PlayScreen
        // renders the prediction step instead of the post-answer waiting state.
        if (field === 'vote') return;
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

        // The reconnect grace period lapsed and the server dropped our in-room
        // player session. Re-identifying on the same socket can't restore that
        // player mid-game, and JOIN may be rejected while a game is in progress,
        // so fail loudly and send the user back through the normal entry flow.
        if (err.code === 'SESSION_EXPIRED') {
          connectAttemptRef.current += 1;
          wsClient.disconnect();
          setCurrentQuestion(null);
          setSelectedAnswer(null);
          setConfirmedAnswer(null);
          setConfirmedGuess(null);
          setConfirmedVote(null);
          setConfirmedPrediction(null);
          pendingAckFieldRef.current = null;
          setRoundResult(null);
          setGameResult(null);
          setMediaPreview(null);
          setPhase('SCAN');
          if (Platform.OS === 'web') {
            alert(err.message);
          } else {
            const { Alert } = require('react-native');
            Alert.alert(err.message);
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
          connectAttemptRef.current += 1;
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
      const attemptId = ++connectAttemptRef.current;
      setError(null);
      setPhase('IDENTIFYING');
      void (async () => {
        const deviceId = await getOrInitDeviceId();
        if (connectAttemptRef.current !== attemptId) return;

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
      const attemptId = ++connectAttemptRef.current;
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
        if (connectAttemptRef.current !== attemptId) return;

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
    connectAttemptRef.current += 1;
    wsClient.disconnect();
    await clearGuestSession();
    setStoredSession(null);
    setReturningError(null);
    setPhase('SCAN');
  }, []);

  /** Dismiss the pre-game connection flow without forgetting the linked host account. */
  const cancelToScan = useCallback(() => {
    connectAttemptRef.current += 1;
    wsClient.disconnect();
    setError(null);
    setReturningError(null);
    setIdentifiedProfile(null);
    setAvailableProfiles([]);
    setPhase('SCAN');
  }, []);

  const join = useCallback(
    (
      name: string,
      roomCode?: string,
      deviceId?: string,
      avatar?: { emoji?: string; color?: string },
    ) => {
      wsClient.join(name, roomCode, deviceId, undefined, avatar);
    },
    [],
  );

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
      pendingAckFieldRef.current = 'answer';
      wsClient.sendAnswer(currentQuestion.id, answer);
    },
    [confirmedAnswer, currentQuestion],
  );

  /** closest_wins: submit a numeric guess. One-shot, like submitAnswer. */
  const submitGuess = useCallback(
    (guess: number) => {
      if (confirmedGuess !== null || !currentQuestion) return;
      setConfirmedGuess(guess);
      pendingAckFieldRef.current = 'guess';
      wsClient.sendGuess(currentQuestion.id, guess);
    },
    [confirmedGuess, currentQuestion],
  );

  /** predict_room step 1: submit this player's own vote. One-shot. */
  const submitVote = useCallback(
    (vote: AnswerKey) => {
      if (confirmedVote || !currentQuestion) return;
      setConfirmedVote(vote);
      pendingAckFieldRef.current = 'vote';
      wsClient.sendVote(currentQuestion.id, vote);
    },
    [confirmedVote, currentQuestion],
  );

  /** predict_room step 2: submit this player's prediction. One-shot. */
  const submitPrediction = useCallback(
    (prediction: AnswerKey) => {
      if (confirmedPrediction || !currentQuestion) return;
      setConfirmedPrediction(prediction);
      pendingAckFieldRef.current = 'prediction';
      wsClient.sendPrediction(currentQuestion.id, prediction);
    },
    [confirmedPrediction, currentQuestion],
  );

  const goToJoin = useCallback(() => {
    setAvailableProfiles([]);
    setPhase('JOIN');
  }, []);

  const reset = useCallback(() => {
    setCurrentQuestion(null);
    setSelectedAnswer(null);
    setConfirmedAnswer(null);
    setConfirmedGuess(null);
    setConfirmedVote(null);
    setConfirmedPrediction(null);
    pendingAckFieldRef.current = null;
    setRoundResult(null);
    setGameResult(null);
    setMediaPreview(null);
    setError(null);
    setPhase('WAITING');
  }, []);

  const setLanguageOverride = useCallback((lang: SupportedLanguage) => {
    languageOverridden.current = true;
    changeLanguage(lang);
    saveLanguagePreference(lang);
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
    confirmedGuess,
    confirmedVote,
    confirmedPrediction,
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
    submitGuess,
    submitVote,
    submitPrediction,
    reset,
    setLanguageOverride,
  };
}
