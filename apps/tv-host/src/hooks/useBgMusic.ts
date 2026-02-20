import { type AudioPlayer, createAudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameMode } from '../context/GameModeContext';

const VOLUME = 0.25;
const MAX_CONSECUTIVE_ERRORS = 3;

export function useBgMusic() {
  const { mode, serverUrl } = useGameMode();
  const [isMuted, setIsMuted] = useState(false);
  const [hasTracks, setHasTracks] = useState(false);

  const playerRef = useRef<AudioPlayer | null>(null);
  const tracksRef = useRef<string[]>([]);
  const trackIndexRef = useRef(0);
  const errorsRef = useRef(0);
  const httpBaseRef = useRef<string | null>(null);

  // Derive HTTP base URL from WebSocket URL
  httpBaseRef.current = serverUrl?.replace(/^wss?:\/\//, 'http://') ?? null;

  const playTrack = useCallback((index: number) => {
    const tracks = tracksRef.current;
    const httpBase = httpBaseRef.current;
    if (tracks.length === 0 || !httpBase || errorsRef.current >= MAX_CONSECUTIVE_ERRORS) return;

    trackIndexRef.current = index;
    const url = `${httpBase}/music/${encodeURIComponent(tracks[index])}`;

    const player = playerRef.current;
    if (!player) return;

    player.replace({ uri: url });
    player.play();
  }, []);

  // Fetch tracks and set up player on mount (hosted mode only)
  useEffect(() => {
    if (mode !== 'hosted' || !httpBaseRef.current) return;

    const httpBase = httpBaseRef.current;
    let cancelled = false;

    const player = createAudioPlayer(null);
    player.volume = VOLUME;
    playerRef.current = player;

    player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        errorsRef.current = 0;
        const next = (trackIndexRef.current + 1) % tracksRef.current.length;
        playTrack(next);
      }
    });

    fetch(`${httpBase}/api/music`)
      .then((r) => r.json())
      .then((data: { tracks?: string[] }) => {
        if (cancelled) return;
        const tracks = data.tracks ?? [];
        tracksRef.current = tracks;
        setHasTracks(tracks.length > 0);
        if (tracks.length > 0) {
          trackIndexRef.current = 0;
          const url = `${httpBase}/music/${encodeURIComponent(tracks[0])}`;
          player.replace({ uri: url });
          player.play();
        }
      })
      .catch(() => {
        // No music available — that's fine
      });

    return () => {
      cancelled = true;
      player.remove();
      playerRef.current = null;
    };
  }, [mode, playTrack]);

  // Sync mute state to player
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => setIsMuted((m) => !m), []);

  return { isMuted, toggleMute, hasTracks };
}
