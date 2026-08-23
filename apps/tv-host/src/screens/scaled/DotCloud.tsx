import { useCallback, useMemo, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * A crowd of one dot per player. The whole point is that the *amount of ink*
 * is the reading — so the dot has to be as big as the space allows, which
 * depends on the screen the TV app happens to be running on (720p set, 1080p
 * projector, 4K panel). Rather than hard-coding sizes per room size, measure
 * the area once and pick the largest dot whose grid still fits.
 */

/** Candidate diameters, largest first. Stepped so two similar rooms look alike. */
const DOT_SIZES = [96, 80, 68, 56, 44, 36, 30, 26, 22, 18, 14, 11, 8, 6];

export function fitDotSize(
  count: number,
  width: number,
  height: number,
  gap: number,
  maxSize: number,
): number {
  const smallest = DOT_SIZES[DOT_SIZES.length - 1];
  if (count <= 0 || width <= 0 || height <= 0) return Math.min(maxSize, DOT_SIZES[0]);

  for (const size of DOT_SIZES) {
    if (size > maxSize) continue;
    const perRow = Math.max(1, Math.floor((width + gap) / (size + gap)));
    const rows = Math.ceil(count / perRow);
    if (rows * (size + gap) - gap <= height) return size;
  }
  return smallest;
}

interface DotCloudSizeOptions {
  /** Dots in the biggest cloud on screen — every cloud shares its size. */
  maxCount: number;
  gap: number;
  maxSize: number;
}

/**
 * Attach the returned `onLayout` to every dot container (they are laid out
 * identically, so any one of them measures the shared area) and render the
 * dots at the returned size.
 */
export function useDotCloudSize({ maxCount, gap, maxSize }: DotCloudSizeOptions) {
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArea((previous) =>
      previous && previous.width === width && previous.height === height
        ? previous
        : { width, height },
    );
  }, []);

  const size = useMemo(
    () => (area ? fitDotSize(maxCount, area.width, area.height, gap, maxSize) : 0),
    [area, maxCount, gap, maxSize],
  );

  // Zero until measured, so the first frame draws an empty area rather than a
  // cloud at the wrong size that visibly resizes a frame later.
  return { size, onLayout };
}
