import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';

export interface PositionChartPlayer {
  playerId: string;
  name: string;
  color: string;
}

export interface PositionChartSnapshot {
  round: number;
  positions: { playerId: string; rank: number }[];
}

export interface PositionChartProps {
  players: PositionChartPlayer[];
  positionHistory: PositionChartSnapshot[];
  width?: number;
  height?: number;
  /**
   * Plot only this many players — the ones who finished on top. Everyone else
   * becomes a shaded band, because a hundred crossing lines is a scribble.
   */
  maxSeries?: number;
  /** Label each line at its right-hand end. Turn off when drawing a legend. */
  showEndLabels?: boolean;
  /** Caption drawn inside the shaded band, e.g. "ranks 9–50 · 42 players". */
  fieldLabel?: string;
}

const PADDING_LEFT = 40;
const PADDING_RIGHT = 80;
const PADDING_RIGHT_NO_LABELS = 16;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 30;
const LINE_WIDTH = 3;
const DOT_RADIUS = 5;
/** Rank gridlines past this many stop being readable and start being hatching. */
const MAX_GRIDLINES = 6;
/**
 * Ranks of headroom kept below the plotted lines, so the shaded band has room
 * to read as "and everyone else down there" instead of a hairline.
 */
const FIELD_BAND_RANKS = 5;

export const PositionChart: React.FC<PositionChartProps> = ({
  players,
  positionHistory,
  width = 600,
  height = 300,
  maxSeries,
  showEndLabels = true,
  fieldLabel,
}) => {
  const { theme } = useTheme();

  if (positionHistory.length === 0 || players.length === 0) return null;

  const totalRounds = positionHistory.length;
  const lastSnapshot = positionHistory[positionHistory.length - 1];
  const finalRank = (playerId: string) =>
    lastSnapshot.positions.find((p) => p.playerId === playerId)?.rank ?? players.length;

  const byFinish = [...players].sort((a, b) => finalRank(a.playerId) - finalRank(b.playerId));
  const plotted = maxSeries === undefined ? byFinish : byFinish.slice(0, maxSeries);
  const inField = maxSeries === undefined ? [] : byFinish.slice(maxSeries);

  // With a field band the rank axis stops just below the plotted lines: ranks
  // worse than that all live in the band, so stretching the axis to the last
  // place would squash every line into the top sliver.
  const rankDomain =
    inField.length > 0
      ? Math.min(players.length, (maxSeries ?? players.length) + FIELD_BAND_RANKS)
      : players.length;

  const paddingRight = showEndLabels ? PADDING_RIGHT : PADDING_RIGHT_NO_LABELS;
  const chartWidth = width - PADDING_LEFT - paddingRight;
  const chartHeight = height - PADDING_TOP - PADDING_BOTTOM;

  const xForRound = (round: number) =>
    PADDING_LEFT + ((round - 1) / Math.max(1, totalRounds - 1)) * chartWidth;

  // Y: rank 1 at top, rankDomain at bottom.
  const yForRank = (rank: number) =>
    PADDING_TOP + ((Math.min(rank, rankDomain) - 1) / Math.max(1, rankDomain - 1)) * chartHeight;

  const gridStep = Math.max(1, Math.ceil(rankDomain / MAX_GRIDLINES));
  const gridRanks: number[] = [];
  for (let rank = 1; rank <= rankDomain; rank += gridStep) gridRanks.push(rank);

  // Build path data for each plotted player
  const playerPaths = plotted
    .map((player) => {
      const points: { x: number; y: number; rank: number }[] = [];

      for (const snapshot of positionHistory) {
        const pos = snapshot.positions.find((p) => p.playerId === player.playerId);
        if (pos) {
          points.push({
            x: xForRound(snapshot.round),
            y: yForRank(pos.rank),
            rank: pos.rank,
          });
        }
      }

      if (points.length === 0) return null;

      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

      const lastPoint = points[points.length - 1];

      return { player, d, points, lastPoint };
    })
    .filter(Boolean) as {
    player: PositionChartPlayer;
    d: string;
    points: { x: number; y: number; rank: number }[];
    lastPoint: { x: number; y: number; rank: number };
  }[];

  // The band's top edge follows the best rank anyone outside the top N held in
  // that round, so it visibly presses upward when the pack closes in.
  const fieldIds = new Set(inField.map((p) => p.playerId));
  const bandTop = positionHistory.map((snapshot) => {
    const ranks = snapshot.positions
      .filter((p) => fieldIds.has(p.playerId))
      .map((p) => p.rank)
      .filter((rank) => Number.isFinite(rank));
    const best = ranks.length > 0 ? Math.min(...ranks) : rankDomain;
    return { x: xForRound(snapshot.round), y: yForRank(best) };
  });
  const bandBottom = yForRank(rankDomain);
  const fieldPolygon =
    inField.length > 0
      ? [
          ...bandTop.map((p) => `${p.x},${p.y}`),
          `${xForRound(totalRounds)},${bandBottom}`,
          `${xForRound(1)},${bandBottom}`,
        ].join(' ')
      : null;
  const bandLabelY = (Math.min(...bandTop.map((p) => p.y)) + bandBottom) / 2;

  return (
    <View style={styles.container}>
      <Svg width={width} height={height}>
        {/* Grid lines for ranks */}
        {gridRanks.map((rank) => {
          const y = yForRank(rank);
          return (
            <Line
              key={`grid-${rank}`}
              x1={PADDING_LEFT}
              y1={y}
              x2={PADDING_LEFT + chartWidth}
              y2={y}
              stroke={theme.track}
              strokeWidth={1}
            />
          );
        })}

        {/* Grid lines for rounds */}
        {Array.from({ length: totalRounds }, (_, i) => {
          const x = xForRound(i + 1);
          return (
            <Line
              key={`round-grid-${i}`}
              x1={x}
              y1={PADDING_TOP}
              x2={x}
              y2={PADDING_TOP + chartHeight}
              stroke={theme.track}
              strokeWidth={1}
            />
          );
        })}

        {/* Y-axis labels (rank numbers) */}
        {gridRanks.map((rank) => (
          <SvgText
            key={`rank-label-${rank}`}
            x={PADDING_LEFT - 10}
            y={yForRank(rank) + 5}
            fill={theme.inkSoft}
            fontSize={14}
            textAnchor="end"
          >
            {`#${rank}`}
          </SvgText>
        ))}

        {/* X-axis labels (round numbers) */}
        {Array.from({ length: totalRounds }, (_, i) => (
          <SvgText
            key={`round-label-${i}`}
            x={xForRound(i + 1)}
            y={height - 6}
            fill={theme.inkSoft}
            fontSize={14}
            textAnchor="middle"
          >
            {i + 1}
          </SvgText>
        ))}

        {/* Everyone below the plotted lines, as a band rather than a scribble */}
        {fieldPolygon && <Polygon points={fieldPolygon} fill={theme.track} />}
        {fieldPolygon && fieldLabel && (
          <SvgText
            x={PADDING_LEFT + chartWidth / 2}
            y={bandLabelY}
            fill={theme.inkSoft}
            fontSize={16}
            textAnchor="middle"
          >
            {fieldLabel}
          </SvgText>
        )}

        {/* Player lines */}
        {playerPaths.map(({ player, d, points, lastPoint }) => (
          <React.Fragment key={player.playerId}>
            <Path
              d={d}
              stroke={player.color}
              strokeWidth={LINE_WIDTH}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Dots at each round */}
            {points.map((point, i) => (
              <Circle
                key={`dot-${player.playerId}-${i}`}
                cx={point.x}
                cy={point.y}
                r={DOT_RADIUS}
                fill={player.color}
              />
            ))}

            {/* Player name label at end */}
            {showEndLabels && (
              <SvgText
                x={lastPoint.x + 10}
                y={lastPoint.y + 5}
                fill={player.color}
                fontSize={14}
                fontWeight="600"
              >
                {player.name}
              </SvgText>
            )}
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
});
