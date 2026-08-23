import { AVATAR_EMOJI_CATEGORIES } from '@unfairenough/shared';
import { borderRadius, colors, spacing, typography } from '@unfairenough/ui';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

interface EmojiSheetProps {
  visible: boolean;
  /** Ringed in the grid so the current badge is findable. */
  selected: string;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  doneLabel: string;
  title: string;
}

/** Columns in the emoji grid — 7 fits a phone without shrinking the glyphs. */
const COLUMNS = 7;

/**
 * The emoji picker, as a bottom sheet.
 *
 * Deliberately built from `Modal` + `Animated` rather than a native sheet
 * library: the player app ships to iOS, Android *and* the web, and one
 * component that behaves the same everywhere is worth more here than
 * drag-to-dismiss physics on two of the three.
 */
export const EmojiSheet: React.FC<EmojiSheetProps> = ({
  visible,
  selected,
  onSelect,
  onClose,
  doneLabel,
  title,
}) => {
  const [tab, setTab] = useState(0);
  const { height } = useWindowDimensions();
  const slide = useRef(new Animated.Value(0)).current;

  // Mounted only while visible, so the sheet always animates in from the
  // bottom rather than appearing where the last one was left.
  useEffect(() => {
    if (!visible) return;
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });
  const category = AVATAR_EMOJI_CATEGORIES[tab];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <Animated.View
        style={[styles.sheet, { maxHeight: height * 0.62, transform: [{ translateY }] }]}
      >
        <View style={styles.grabberRow}>
          <View style={styles.grabber} />
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12} testID="emoji-sheet-done">
            <Text style={styles.done}>{doneLabel}</Text>
          </Pressable>
        </View>

        <View style={styles.tabs}>
          {AVATAR_EMOJI_CATEGORIES.map((c, i) => (
            <Pressable
              key={c.id}
              onPress={() => setTab(i)}
              style={[styles.tab, i === tab && styles.tabActive]}
              testID={`emoji-tab-${c.id}`}
            >
              <Text style={styles.tabIcon}>{c.icon}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {category.emoji.map((char) => (
            <Pressable
              key={char}
              onPress={() => onSelect(char)}
              style={[styles.cell, char === selected && styles.cellSelected]}
              testID={`emoji-option-${char}`}
            >
              <Text style={styles.cellText}>{char}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 8, 20, 0.55)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // `colors.card` is a translucent tint meant to sit on the screen
    // gradient; a sheet floating over dimmed content needs a solid surface.
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing.lg,
    // Without this the grid spills past `maxHeight` on web, which doesn't
    // clip absolutely-positioned children the way native does.
    overflow: 'hidden',
  },
  grabberRow: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.track,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  done: {
    ...typography.button,
    color: colors.accent,
  },
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  tab: {
    width: 46,
    height: 40,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.chipBg,
  },
  tabActive: {
    backgroundColor: colors.accentSoft,
  },
  tabIcon: {
    fontSize: 21,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  cell: {
    width: `${100 / COLUMNS}%`,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cellSelected: {
    borderColor: colors.accent,
  },
  cellText: {
    fontSize: 28,
  },
});
