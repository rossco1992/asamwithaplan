import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import { accessibilityLabelFor, formatDate, type JourneyNode } from '@/lib/journey';

export const NODE_SIZE = 56;
export const CURRENT_SIZE = 68;

interface Props {
  node: JourneyNode;
  initials: string;
  onPress: () => void;
  onLongPress: () => void;
}

/** The soft halo that breathes around "you are here". Still when Reduce Motion is on. */
function Pulse({ size, color }: { size: number; color: string }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [reduceMotion, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.25 : 0.35 * (1 - progress.value),
    transform: [{ scale: reduceMotion ? 1.18 : 1 + progress.value * 0.45 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

export function MapNode({ node, initials, onPress, onLongPress }: Props) {
  const colors = useColors();
  const isCurrent = node.isCurrent;
  const size = isCurrent ? CURRENT_SIZE : NODE_SIZE;

  let fill = colors.card;
  let border = colors.border;
  let content: React.ReactNode;

  switch (node.state) {
    case 'done':
      fill = colors.primary;
      border = colors.primary;
      content = <Ionicons name="checkmark" size={26} color={colors.primaryForeground} />;
      break;
    case 'skipped':
      fill = colors.muted;
      border = colors.border;
      content = <Ionicons name="remove" size={22} color={colors.mutedForeground} />;
      break;
    case 'overdue':
      fill = colors.warningSoft;
      border = colors.warning;
      content = isCurrent ? (
        <Text style={[styles.initials, { color: colors.warning }]} maxFontSizeMultiplier={1.2}>
          {initials}
        </Text>
      ) : (
        <Ionicons name="time-outline" size={24} color={colors.warning} />
      );
      break;
    case 'current':
      fill = colors.accent;
      border = colors.accent;
      content = (
        <Text style={[styles.initials, { color: colors.accentForeground }]} maxFontSizeMultiplier={1.2}>
          {initials}
        </Text>
      );
      break;
    default:
      content =
        node.tasks.length > 0 ? (
          <Text style={[styles.count, { color: colors.mutedForeground }]} maxFontSizeMultiplier={1.2}>
            {node.tasksDone}/{node.tasks.length}
          </Text>
        ) : (
          <Ionicons name="ellipse-outline" size={14} color={colors.mutedForeground} />
        );
  }

  // Couples' own milestones are diamonds so they stand out from the starter ones.
  const shape = node.isCustom
    ? { borderRadius: 14, transform: [{ rotate: '45deg' }], width: size * 0.84, height: size * 0.84 }
    : { borderRadius: size / 2, width: size, height: size };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabelFor(node)}
      accessibilityHint="Opens this milestone. Long press to add one nearby."
      hitSlop={10}
      style={({ pressed }) => [styles.hit, { width: size, height: size }, pressed && { transform: [{ scale: 0.94 }] }]}
    >
      {isCurrent ? <Pulse size={size} color={node.state === 'overdue' ? colors.warning : colors.accent} /> : null}
      <View
        style={[
          styles.disc,
          shape,
          {
            backgroundColor: fill,
            borderColor: border,
            borderStyle: node.state === 'skipped' ? 'dashed' : 'solid',
          },
        ]}
      >
        <View style={node.isCustom ? { transform: [{ rotate: '-45deg' }] } : undefined}>{content}</View>
      </View>
    </Pressable>
  );
}

/** Title and date beside a stop, on the outside of the curve. */
export function NodeLabel({
  node,
  side,
  maxWidth,
}: {
  node: JourneyNode;
  side: 'left' | 'right';
  maxWidth: number;
}) {
  const colors = useColors();
  const muted = node.state === 'done' || node.state === 'skipped';
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ maxWidth, alignItems: side === 'left' ? 'flex-end' : 'flex-start' }}
    >
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={1.5}
        style={[
          styles.title,
          { color: muted ? colors.mutedForeground : colors.primary, textAlign: side === 'left' ? 'right' : 'left' },
          node.state === 'skipped' && { textDecorationLine: 'line-through' },
        ]}
      >
        {node.title}
      </Text>
      {node.dueDate ? (
        <Text
          maxFontSizeMultiplier={1.5}
          style={[styles.date, { color: node.state === 'overdue' ? colors.warning : colors.mutedForeground }]}
        >
          {node.state === 'overdue' ? 'Overdue · ' : ''}
          {formatDate(node.dueDate, { month: 'short', day: 'numeric' })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { alignItems: 'center', justifyContent: 'center' },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#192034',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  initials: { fontFamily: fonts.serifBold, fontSize: 20, letterSpacing: 0.5 },
  count: { fontFamily: fonts.sansSemiBold, fontSize: 13 },
  title: { fontFamily: fonts.sansSemiBold, fontSize: 14, lineHeight: 18 },
  date: { fontFamily: fonts.sans, fontSize: 12, marginTop: 2 },
});
