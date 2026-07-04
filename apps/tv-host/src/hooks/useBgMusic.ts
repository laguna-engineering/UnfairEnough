import { type AudioPlayer, createAudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

const VOLUME = 0.25;

// Background music is bundled with the app, so it plays in every mode
// (local + hosted) with no server, network, or auth dependency.
const TRACKS = [
  require('../../assets/music/01-playground.mp3'),
  require('../../assets/music/02-green-field.mp3'),
  require('../../assets/music/03-fun-time.mp3'),
  require('../../assets/music/04-solve-puzzle.mp3'),
  require('../../assets/music/05-the-shepherd.mp3'),
  require('../../assets/music/06-dancing-robot.mp3'),
  require('../../assets/music/07-riding-horse.mp3'),
];

export function useBgMusic() {
  const [isMuted, setIsMuted] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);
  const trackIndexRef = useRef(0);
  // Ref-counted so overlapping screens during a phase transition (e.g. one
  // screen unmounting as the next mounts) can't leave the ambient track stuck.
  const duckDepthRef = useRef(0);

  // Create the player once and loop through the bundled tracks.
  useEffect(() => {
    if (TRACKS.length === 0) return;

    const player = createAudioPlayer(TRACKS[0]);
    player.volume = VOLUME;
    playerRef.current = player;

    player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        trackIndexRef.current = (trackIndexRef.current + 1) % TRACKS.length;
        player.replace(TRACKS[trackIndexRef.current]);
        player.play();
      }
    });

    player.play();

    return () => {
      player.remove();
      playerRef.current = null;
    };
  }, []);

  // Sync mute state to the player.
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => setIsMuted((m) => !m), []);

  // Duck the ambient track while question/preview audio plays. `resume` plays
  // through the still-synced `muted` flag, so a user-muted track stays muted.
  const pause = useCallback(() => {
    duckDepthRef.current += 1;
    if (duckDepthRef.current === 1) playerRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    if (duckDepthRef.current === 0) return;
    duckDepthRef.current -= 1;
    if (duckDepthRef.current === 0) playerRef.current?.play();
  }, []);

  return { isMuted, toggleMute, hasTracks: TRACKS.length > 0, pause, resume };
}
