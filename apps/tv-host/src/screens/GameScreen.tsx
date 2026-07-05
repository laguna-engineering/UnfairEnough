import { ThemeProvider } from '@unfairenough/ui';
import type React from 'react';
import { BgMusicProvider, useBgMusicContext } from '../hooks/BgMusicContext';
import { useGameController } from '../hooks/useGameController';
import { CountdownScreen } from './CountdownScreen';
import { GameOverScreen } from './GameOverScreen';
import { LobbyScreen } from './LobbyScreen';
import { MediaPreviewScreen } from './MediaPreviewScreen';
import { QuestionScreen } from './QuestionScreen';
import { ResultsScreen } from './ResultsScreen';
import { RevealScreen } from './RevealScreen';

const GameScreenInner: React.FC = () => {
  const { phase } = useGameController();
  const bgMusic = useBgMusicContext();

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

export const GameScreen: React.FC = () => (
  <ThemeProvider>
    <BgMusicProvider>
      <GameScreenInner />
    </BgMusicProvider>
  </ThemeProvider>
);
