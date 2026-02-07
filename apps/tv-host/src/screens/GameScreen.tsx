import type React from 'react';
import { useGameController } from '../hooks/useGameController';
import { CountdownScreen } from './CountdownScreen';
import { GameOverScreen } from './GameOverScreen';
import { LobbyScreen } from './LobbyScreen';
import { MediaPreviewScreen } from './MediaPreviewScreen';
import { QuestionScreen } from './QuestionScreen';
import { ResultsScreen } from './ResultsScreen';
import { RevealScreen } from './RevealScreen';

export const GameScreen: React.FC = () => {
  const { phase } = useGameController();

  switch (phase) {
    case 'LOBBY':
      return <LobbyScreen />;
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
      return <LobbyScreen />;
  }
};
