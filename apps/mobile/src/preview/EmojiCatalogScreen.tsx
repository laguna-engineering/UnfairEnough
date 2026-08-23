import { AVATAR_EMOJI_CATEGORIES } from '@unfairenough/shared';
import { borderRadius, colors, ScreenBackground, spacing, typography } from '@unfairenough/ui';
import type React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * Every candidate emoji, labelled, so the set can be pruned by eye before it
 * ships. Not part of the game — reached only through `?preview=EMOJI_CATALOG`
 * on the web dev build, and screenshotted by e2e/mobile/emoji-catalog.spec.ts.
 *
 * Each glyph carries a code (`FA07`, `AN23`, …) so a review can name the ones
 * to drop without anybody counting rows.
 */

/** Columns here, not the picker's 7 — labels need the extra room. */
const COLUMNS = 6;

/** `?category=<id>` renders one tab's worth, which is what gets screenshotted. */
interface EmojiCatalogScreenProps {
  categoryId?: string;
}

const CODE_PREFIX: Record<string, string> = {
  faces: 'FA',
  animals: 'AN',
  food: 'FO',
  fun: 'FU',
};

export const EmojiCatalogScreen: React.FC<EmojiCatalogScreenProps> = ({ categoryId }) => {
  const categories = categoryId
    ? AVATAR_EMOJI_CATEGORIES.filter((c) => c.id === categoryId)
    : AVATAR_EMOJI_CATEGORIES;

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.content}>
        {categories.map((category) => (
          <View key={category.id}>
            <Text style={styles.heading}>
              {category.icon} {category.id} · {category.emoji.length}
            </Text>
            <View style={styles.grid}>
              {category.emoji.map((char, i) => (
                <View key={char} style={styles.cell}>
                  <Text style={styles.glyph}>{char}</Text>
                  <Text style={styles.code}>
                    {CODE_PREFIX[category.id]}
                    {String(i + 1).padStart(2, '0')}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    gap: spacing.lg,
  },
  heading: {
    ...typography.h3,
    color: colors.primary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / COLUMNS}%`,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  glyph: {
    fontSize: 32,
    lineHeight: 40,
  },
  code: {
    ...typography.bodySmall,
    fontSize: 10,
    color: colors.textSecondary,
  },
});
