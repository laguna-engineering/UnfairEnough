import type { Player } from '@unfairenough/game-logic';
import { formatOrdinal, useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  colors,
  ScreenBackground,
  spacing,
  type ThemeTokens,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type { PlayerResult, Question } from '@unfairenough/ws-protocol';
import type React from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { withAlpha } from '../../utils/color';
import { TypeBadge } from '../questionTypes/TypeBadge';
import { useDotCloudSize } from './DotCloud';
import { CLOSEST_TOP_N } from './scale';

/**
 * Closest-wins results for a big room (screen 1c).
 *
 * The number line with a labelled chip per guess stops working the moment more
 * than a handful of people play — the chips stack and cover each other. Here
 * the room collapses into five proximity bands spread outward from the true
 * answer, one dot per guess, and only the closest few are named. The shape is
 * readable from the back of the room; everyone else reads their own distance
 * off their phone.
 */

interface ScaledClosestWinsResultsProps {
  question: Question & { serverTimestamp: number };
  playerResults: PlayerResult[];
  players: Player[];
  correctValue: number;
  playerCount: number;
}

type BandId = 'farUnder' | 'nearUnder' | 'within' | 'nearOver' | 'farOver';

interface Band {
  id: BandId;
  label: string;
  results: PlayerResult[];
}

/**
 * Rounds a band edge to one significant figure so the label reads like a
 * human picked it ("within 1,000") rather than like a computer derived it
 * from the range ("within 1,200").
 */
function niceRound(value: number): number {
  if (value < 10) return Math.max(1, Math.round(value));
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.round(value / magnitude) * magnitude;
}

const DOT_GAP = spacing.xs;
const DOT_MAX_SIZE = 44;

function pointsLabel(results: PlayerResult[]): string {
  if (results.length === 0) return '';
  const points = results.map((r) => r.pointsEarned);
  const min = Math.min(...points);
  const max = Math.max(...points);
  return min === max ? `+${min}` : `+${min}–${max}`;
}

export const ScaledClosestWinsResults: React.FC<ScaledClosestWinsResultsProps> = ({
  question,
  playerResults,
  players,
  correctValue,
  playerCount,
}) => {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const colorById = useMemo(() => new Map(players.map((p) => [p.id, p.color])), [players]);

  const guessers = useMemo(
    () => playerResults.filter((r) => r.guess !== null && r.guess !== undefined),
    [playerResults],
  );

  const { bands, maxBandCount } = useMemo(() => {
    const range = question.range ?? { min: 0, max: 0 };
    const span = range.max - range.min || Math.max(1, Math.abs(correctValue));
    const near = niceRound(span * 0.1);
    const far = Math.max(niceRound(span * 0.4), near * 2);

    const byId: Record<BandId, PlayerResult[]> = {
      farUnder: [],
      nearUnder: [],
      within: [],
      nearOver: [],
      farOver: [],
    };

    for (const result of guessers) {
      const delta = (result.guess as number) - correctValue;
      const distance = Math.abs(delta);
      if (distance < near) byId.within.push(result);
      else if (distance < far) byId[delta < 0 ? 'nearUnder' : 'nearOver'].push(result);
      else byId[delta < 0 ? 'farUnder' : 'farOver'].push(result);
    }

    const nearText = near.toLocaleString();
    const farText = far.toLocaleString();
    const labels: Record<BandId, string> = {
      farUnder: t('results.bandFarUnder', { value: farText }),
      nearUnder: t('results.bandNearUnder', { near: nearText, far: farText }),
      within: t('results.bandWithin', { value: nearText }),
      nearOver: t('results.bandNearOver', { near: nearText, far: farText }),
      farOver: t('results.bandFarOver', { value: farText }),
    };
    // Far-under → within → far-over, so the shape reads as a distribution
    // spreading outward from the true answer in the middle.
    const order: BandId[] = ['farUnder', 'nearUnder', 'within', 'nearOver', 'farOver'];
    const ordered: Band[] = order.map((id) => ({ id, label: labels[id], results: byId[id] }));

    return {
      bands: ordered,
      maxBandCount: Math.max(0, ...ordered.map((b) => b.results.length)),
    };
  }, [guessers, question.range, correctValue, t]);

  const closest = useMemo(
    () =>
      [...guessers]
        .sort(
          (a, b) =>
            Math.abs((a.guess as number) - correctValue) -
            Math.abs((b.guess as number) - correctValue),
        )
        .slice(0, CLOSEST_TOP_N),
    [guessers, correctValue],
  );

  const { size: dotSize, onLayout: onDotsLayout } = useDotCloudSize({
    maxCount: maxBandCount,
    gap: DOT_GAP,
    maxSize: DOT_MAX_SIZE,
  });

  return (
    <ScreenBackground style={styles.container}>
      <View style={styles.header}>
        <TypeBadge kind="closest_wins" />
        <Text style={styles.progress}>
          {t('game.question', {
            current: question.questionNumber,
            total: question.totalQuestions,
          })}
        </Text>
        <View style={styles.spacer} />
        <Text style={styles.roomSize}>{t('results.playersInRoom', { count: playerCount })}</Text>
      </View>

      <View style={styles.questionBlock}>
        <Text style={styles.questionText} numberOfLines={2}>
          {question.text}
        </Text>
        <View style={styles.answerRow}>
          <Text style={styles.answerLabel}>{t('results.theAnswer')}</Text>
          <Text style={styles.answerValue}>{correctValue.toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.bands}>
          {bands.map((band) => (
            <View
              key={band.id}
              testID="proximity-band"
              style={[styles.band, band.id === 'within' && styles.bandWithin]}
            >
              <Text style={styles.bandLabel} numberOfLines={2}>
                {band.label}
              </Text>
              <View style={styles.bandCountRow}>
                <Text testID="band-count" style={styles.bandCount}>
                  {band.results.length}
                </Text>
                <Text style={styles.bandCountLabel}>
                  {t('results.playersWord', { count: band.results.length })}
                </Text>
              </View>
              <View style={styles.bandDots} onLayout={onDotsLayout}>
                {dotSize > 0 &&
                  band.results.map((result) => (
                    <View
                      key={result.playerId}
                      style={{
                        width: dotSize,
                        height: dotSize,
                        borderRadius: dotSize / 2,
                        backgroundColor: colorById.get(result.playerId) ?? theme.accent,
                        opacity: 0.85,
                      }}
                    />
                  ))}
              </View>
              <Text style={styles.bandPoints}>{pointsLabel(band.results)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.closestPanel}>
          <Text style={styles.closestTitle}>
            {t('results.topNClosest', { count: closest.length })}
          </Text>
          {closest.map((result, index) => (
            <View key={result.playerId} testID="closest-row" style={styles.closestRow}>
              <Text style={styles.closestRank}>{formatOrdinal(index + 1, i18n.language)}</Text>
              <View
                style={[
                  styles.closestDot,
                  { backgroundColor: colorById.get(result.playerId) ?? theme.accent },
                ]}
              />
              <Text style={styles.closestName} numberOfLines={1}>
                {result.name}
              </Text>
              <Text style={styles.closestGuess}>{result.guess?.toLocaleString()}</Text>
              <Text style={styles.closestPoints}>+{result.pointsEarned}</Text>
            </View>
          ))}
          <Text style={styles.closestNote}>{t('results.closestRestOnPhones')}</Text>
        </View>
      </View>
    </ScreenBackground>
  );
};

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      padding: spacing.xl,
      gap: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    progress: {
      ...typography.h2,
      color: t.inkSoft,
    },
    spacer: {
      flex: 1,
    },
    roomSize: {
      ...typography.h3,
      color: t.inkSoft,
    },
    questionBlock: {
      alignItems: 'center',
      gap: spacing.xs,
    },
    questionText: {
      ...typography.h1,
      color: t.ink,
      textAlign: 'center',
    },
    answerRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.md,
    },
    answerLabel: {
      ...typography.label,
      color: t.inkSoft,
      letterSpacing: 3,
    },
    answerValue: {
      ...typography.displayMedium,
      color: colors.accentYellow,
    },
    body: {
      flex: 1,
      flexDirection: 'row',
      gap: spacing.md,
    },
    bands: {
      flex: 1,
      flexDirection: 'row',
      gap: spacing.sm,
    },
    band: {
      flex: 1,
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.xl,
      backgroundColor: t.card,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
    },
    bandWithin: {
      backgroundColor: withAlpha(colors.accentYellow, 0.14),
      borderColor: colors.accentYellow,
      borderWidth: 2,
    },
    bandLabel: {
      ...typography.label,
      color: t.inkSoft,
    },
    bandCountRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.xs,
    },
    bandCount: {
      ...typography.displayMedium,
      color: t.ink,
    },
    bandCountLabel: {
      ...typography.body,
      color: t.inkSoft,
    },
    bandDots: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignContent: 'center',
      justifyContent: 'center',
      gap: DOT_GAP,
      overflow: 'hidden',
    },
    bandPoints: {
      ...typography.label,
      color: t.inkSoft,
    },
    closestPanel: {
      width: 440,
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.xl,
      backgroundColor: withAlpha(colors.accentYellow, 0.08),
      borderWidth: 1.5,
      borderColor: withAlpha(colors.accentYellow, 0.35),
    },
    closestTitle: {
      ...typography.label,
      color: colors.accentYellow,
      letterSpacing: 2,
    },
    closestRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: t.card,
    },
    closestRank: {
      ...typography.h3,
      color: t.inkSoft,
      width: 48,
    },
    closestDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
    },
    closestName: {
      ...typography.bodyLarge,
      color: t.ink,
      flex: 1,
    },
    closestGuess: {
      ...typography.bodyLarge,
      color: t.inkSoft,
    },
    closestPoints: {
      ...typography.h3,
      color: colors.accentYellow,
      width: 76,
      textAlign: 'right',
    },
    closestNote: {
      ...typography.bodySmall,
      color: t.inkSoft,
    },
  });
