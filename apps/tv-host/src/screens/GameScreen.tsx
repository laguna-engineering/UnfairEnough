import React from 'react';
import { useGameController } from '../hooks/useGameController';
import { LobbyScreen } from './LobbyScreen';
import { CountdownScreen } from './CountdownScreen';
import { MediaPreviewScreen } from './MediaPreviewScreen';
import { QuestionScreen } from './QuestionScreen';
import { RevealScreen } from './RevealScreen';
import { ResultsScreen } from './ResultsScreen';
import { GameOverScreen } from './GameOverScreen';

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
