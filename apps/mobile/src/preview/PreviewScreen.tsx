import type { AnswerKey, QuestionType } from '@unfairenough/ws-protocol';
import type React from 'react';
import { CountdownScreen } from '../screens/CountdownScreen';
import { GameOverScreen } from '../screens/GameOverScreen';
import { JoinScreen } from '../screens/JoinScreen';
import { MediaPreviewScreen } from '../screens/MediaPreviewScreen';
import { PlayScreen } from '../screens/PlayScreen';
import { ProfilePickerScreen } from '../screens/ProfilePickerScreen';
import { ResultScreen } from '../screens/ResultScreen';
import { ReturningUserScreen } from '../screens/ReturningUserScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { WaitingScreen } from '../screens/WaitingScreen';
import { WelcomeBackScreen } from '../screens/WelcomeBackScreen';
import { EmojiCatalogScreen } from './EmojiCatalogScreen';
import {
  PREVIEW_GUEST_SESSION,
  PREVIEW_JOIN_AVATAR,
  PREVIEW_MEDIA_PREVIEW,
  PREVIEW_PLAYER_ID,
  PREVIEW_PROFILES,
  PREVIEW_WELCOME,
  previewGameResult,
  previewQuestion,
  previewRoundResult,
} from './previewData';

/**
 * Renders one screen of the player app with fixed mock data, so layouts can be
 * inspected (and screenshotted) without a server, a room or eleven friends.
 * Reached with `?preview=<SCREEN>` on the web dev build — see App.tsx.
 *
 * The pre-game screens normally live in a navigation modal; here they render
 * full-screen, which is the same layout minus the modal chrome.
 */

export type PreviewScreenName =
  | 'SCAN'
  | 'JOIN'
  | 'PICK_PROFILE'
  | 'WELCOME_BACK'
  | 'RETURNING'
  | 'WAITING'
  | 'COUNTDOWN'
  | 'MEDIA_PREVIEW'
  | 'PLAY'
  | 'RESULT'
  | 'GAME_OVER'
  | 'EMOJI_CATALOG';

export const PREVIEW_SCREENS: PreviewScreenName[] = [
  'SCAN',
  'JOIN',
  'PICK_PROFILE',
  'WELCOME_BACK',
  'RETURNING',
  'WAITING',
  'COUNTDOWN',
  'MEDIA_PREVIEW',
  'PLAY',
  'RESULT',
  'GAME_OVER',
  'EMOJI_CATALOG',
];

export interface PreviewScreenOptions {
  /** Question type for PLAY and RESULT. Defaults to multiple_choice. */
  questionType?: QuestionType;
  /** Players in the room, 3–12. Drives the RESULT and GAME_OVER standings. */
  players?: number;
  /** PLAY only: show the state after this player has locked their answer in. */
  answered?: boolean;
  /** EMOJI_CATALOG only: render just one category instead of all four. */
  categoryId?: string;
}

const noop = () => {};

interface PreviewScreenProps extends PreviewScreenOptions {
  screen: PreviewScreenName;
}

export const PreviewScreen: React.FC<PreviewScreenProps> = ({
  screen,
  questionType = 'multiple_choice',
  players = 8,
  answered = false,
  categoryId,
}) => {
  switch (screen) {
    case 'SCAN':
      return <ScanScreen onConnect={noop} onLanguageChange={noop} />;

    case 'JOIN':
      return (
        <JoinScreen
          onJoin={noop}
          isConnecting={false}
          error={null}
          initialAvatar={PREVIEW_JOIN_AVATAR}
        />
      );

    case 'EMOJI_CATALOG':
      return <EmojiCatalogScreen categoryId={categoryId} />;

    case 'PICK_PROFILE':
      return (
        <ProfilePickerScreen
          profiles={PREVIEW_PROFILES}
          onPickProfile={noop}
          onPlayAsGuest={noop}
          error={null}
        />
      );

    case 'WELCOME_BACK':
      return (
        <WelcomeBackScreen
          profile={{ displayName: 'Charlie', totalGames: 24, totalWins: 6 }}
          onConfirm={noop}
          onReject={noop}
        />
      );

    case 'RETURNING':
      return (
        <ReturningUserScreen
          session={PREVIEW_GUEST_SESSION}
          error={null}
          onPlay={noop}
          onDisconnect={noop}
        />
      );

    case 'COUNTDOWN':
      return <CountdownScreen countdown={3} />;

    case 'MEDIA_PREVIEW':
      return <MediaPreviewScreen mediaPreview={PREVIEW_MEDIA_PREVIEW} />;

    case 'PLAY': {
      // Each question type confirms through a different field; predict_room
      // needs both, since a player votes first and predicts second.
      const isChoice = questionType === 'multiple_choice' || questionType === 'true_false';
      const confirmedKey: AnswerKey = questionType === 'true_false' ? 'B' : 'C';
      return (
        <PlayScreen
          question={previewQuestion(questionType)}
          timeRemaining={8}
          confirmedAnswer={answered && isChoice ? confirmedKey : null}
          confirmedGuess={answered && questionType === 'closest_wins' ? 7200 : null}
          confirmedVote={answered && questionType === 'predict_room' ? 'B' : null}
          confirmedPrediction={answered && questionType === 'predict_room' ? 'B' : null}
          onSubmitAnswer={noop}
          onSubmitGuess={noop}
          onSubmitVote={noop}
          onSubmitPrediction={noop}
        />
      );
    }

    case 'RESULT': {
      // What this player picked: their vote for predict_room, their answer
      // otherwise, and nothing at all for a numeric guess.
      const myPick: AnswerKey | null =
        questionType === 'closest_wins' ? null : questionType === 'multiple_choice' ? 'C' : 'B';
      return (
        <ResultScreen
          result={previewRoundResult(questionType, players)}
          playerId={PREVIEW_PLAYER_ID}
          confirmedAnswer={myPick}
          question={previewQuestion(questionType)}
        />
      );
    }

    case 'GAME_OVER':
      return (
        <GameOverScreen
          result={previewGameResult(players)}
          playerId={PREVIEW_PLAYER_ID}
          onPlayAgain={noop}
          totalGamesBefore={24}
        />
      );

    default:
      return <WaitingScreen playerInfo={PREVIEW_WELCOME} />;
  }
};
