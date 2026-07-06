import { ThemeProvider } from '@unfairenough/ui';
import type React from 'react';
import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { BgMusicProvider, useBgMusicContext } from '../hooks/BgMusicContext';
import { useGameController } from '../hooks/useGameController';
import { CountdownScreen } from './CountdownScreen';
import { GameOverScreen } from './GameOverScreen';
import { LobbyScreen } from './LobbyScreen';
import { MediaPreviewScreen } from './MediaPreviewScreen';
import { QuestionScreen } from './QuestionScreen';
import { ResultsScreen } from './ResultsScreen';
import { RevealScreen } from './RevealScreen';
import { TerminateGameModal } from './TerminateGameModal';

const GameScreenInner: React.FC = () => {
  const { phase, resetGame } = useGameController();
  const bgMusic = useBgMusicContext();
  const [showTerminateModal, setShowTerminateModal] = useState(false);

  // Only guard the back button while a game is in progress. LOBBY has nothing to
  // terminate, and GAME_OVER already offers its own "back to lobby" action.
  const isGameInProgress = phase !== 'LOBBY' && phase !== 'GAME_OVER';

  useEffect(() => {
    if (!isGameInProgress) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Toggle the confirmation: first back opens it, a second back dismisses it.
      setShowTerminateModal((shown) => !shown);
      return true;
    });
    return () => sub.remove();
  }, [isGameInProgress]);

  const renderPhase = () => {
    switch (phase) {
      case 'LOBBY':
        return <LobbyScreen bgMusic={bgMusic} />;
      case 'COUNTDOWN':
        return <CountdownScreen />;
      case 'MEDIA_PREVIEW':
        return <MediaPreviewScreen />;
      case 'QUESTION':
        return <QuestionScreen />;
      case 'REVEALING':
        return <RevealScreen />;
      case 'RESULTS':
        return <ResultsScreen />;
      case 'GAME_OVER':
        return <GameOverScreen />;
      default:
        return <LobbyScreen bgMusic={bgMusic} />;
    }
  };

  return (
    <>
      {renderPhase()}
      <TerminateGameModal
        visible={showTerminateModal}
        onCancel={() => setShowTerminateModal(false)}
        onConfirm={() => {
          setShowTerminateModal(false);
          resetGame();
        }}
      />
    </>
  );
};

export const GameScreen: React.FC = () => (
  <ThemeProvider>
    <BgMusicProvider>
      <GameScreenInner />
    </BgMusicProvider>
  </ThemeProvider>
);
