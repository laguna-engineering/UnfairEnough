/**
 * Greedily stagger position-anchored markers (e.g. the closest-wins number
 * line) across a fixed number of vertical lanes so overlapping chips fan out
 * instead of stacking on top of each other. Each marker goes to whichever
 * lane's most recent occupant is farthest behind it along the axis.
 */
export function assignLanes<T extends { pos: number }>(
  markers: T[],
  laneCount = 3,
): (T & { lane: number })[] {
  const sorted = [...markers].sort((a, b) => a.pos - b.pos);
  const laneLastPos = new Array(laneCount).fill(-Infinity);

  return sorted.map((marker) => {
    let lane = 0;
    let bestGap = -Infinity;
    for (let i = 0; i < laneCount; i++) {
      const gap = marker.pos - laneLastPos[i];
      if (gap > bestGap) {
        bestGap = gap;
        lane = i;
      }
    }
    laneLastPos[lane] = marker.pos;
    return { ...marker, lane };
  });
}
