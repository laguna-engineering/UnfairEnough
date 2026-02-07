import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

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
}

const PADDING_LEFT = 40;
const PADDING_RIGHT = 80;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 30;
const LINE_WIDTH = 3;
const DOT_RADIUS = 5;

export const PositionChart: React.FC<PositionChartProps> = ({
  players,
  positionHistory,
  width = 600,
  height = 300,
}) => {
  if (positionHistory.length === 0 || players.length === 0) return null;

  const totalRounds = positionHistory.length;
  const maxPlayers = players.length;

  const chartWidth = width - PADDING_LEFT - PADDING_RIGHT;
  const chartHeight = height - PADDING_TOP - PADDING_BOTTOM;

  const xForRound = (round: number) =>
    PADDING_LEFT + ((round - 1) / Math.max(1, totalRounds - 1)) * chartWidth;

  // Y: rank 1 at top, maxPlayers at bottom
  const yForRank = (rank: number) =>
    PADDING_TOP + ((rank - 1) / Math.max(1, maxPlayers - 1)) * chartHeight;

  // Build path data for each player
  const playerPaths = players.map((player) => {
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

    const d = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');

    const lastPoint = points[points.length - 1];

    return { player, d, points, lastPoint };
  }).filter(Boolean) as {
    player: PositionChartPlayer;
    d: string;
    points: { x: number; y: number; rank: number }[];
    lastPoint: { x: number; y: number; rank: number };
  }[];

  return (
    <View style={styles.container}>
      <Svg width={width} height={height}>
        {/* Grid lines for ranks */}
        {Array.from({ length: maxPlayers }, (_, i) => {
          const y = yForRank(i + 1);
          return (
            <Line
              key={`grid-${i}`}
              x1={PADDING_LEFT}
              y1={y}
              x2={PADDING_LEFT + chartWidth}
              y2={y}
              stroke="rgba(255,255,255,0.1)"
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
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={1}
            />
          );
        })}

        {/* Y-axis labels (rank numbers) */}
        {Array.from({ length: maxPlayers }, (_, i) => (
          <SvgText
            key={`rank-label-${i}`}
            x={PADDING_LEFT - 10}
            y={yForRank(i + 1) + 5}
            fill={colors.textSecondary}
            fontSize={14}
            textAnchor="end"
          >
            {`#${i + 1}`}
          </SvgText>
        ))}

        {/* X-axis labels (round numbers) */}
        {Array.from({ length: totalRounds }, (_, i) => (
          <SvgText
            key={`round-label-${i}`}
            x={xForRound(i + 1)}
            y={height - 6}
            fill={colors.textSecondary}
            fontSize={14}
            textAnchor="middle"
          >
            {i + 1}
          </SvgText>
        ))}

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
            <SvgText
              x={lastPoint.x + 10}
              y={lastPoint.y + 5}
              fill={player.color}
              fontSize={14}
              fontWeight="600"
            >
              {player.name}
            </SvgText>
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
