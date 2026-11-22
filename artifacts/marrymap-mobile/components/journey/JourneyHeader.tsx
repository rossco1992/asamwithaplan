import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import { formatDate, type Journey } from '@/lib/journey';

export type JourneyView = 'map' | 'list' | 'plan';

const VIEWS: { key: JourneyView; label: string }[] = [
  { key: 'map', label: 'Map' },
  { key: 'list', label: 'List' },
  { key: 'plan', label: "Sam's plan" },
];

function ProgressRing({ percent, size = 56 }: { percent: number; size?: number }) {
  const colors = useColors();
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(100, percent)) / 100;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.secondary} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - filled)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[styles.ringText, { color: colors.primary }]} maxFontSizeMultiplier={1.3}>
        {percent}%
      </Text>
    </View>
  );
}

interface Props {
  journey: Journey;
  view: JourneyView;
  onChangeView: (view: JourneyView) => void;
  onAdd: () => void;
  onEditDate: () => void;
  onOpenCouple: () => void;
  onOpenReminders: () => void;
  /** This phone has milestone reminders on. */
  remindersOn: boolean;
  /** "RS" once both partners are in; shown on the couple button. */
  coupleInitials: string;
  partnerJoined: boolean;
}

export function JourneyHeader({
  journey,
  view,
  onChangeView,
  onAdd,
  onEditDate,
  onOpenCouple,
  onOpenReminders,
  remindersOn,
  coupleInitials,
  partnerJoined,
}: Props) {
  const colors = useColors();
  const { daysToGo, weddingDate, progress } = journey;

  let countdown: string;
  if (daysToGo === null) countdown = 'Date to be decided';
  else if (daysToGo > 1) countdown = `${daysToGo} days to go`;
  else if (daysToGo === 1) countdown = 'Tomorrow';
  else if (daysToGo === 0) countdown = 'Today is the day';
  else countdown = 'Married!';

  return (
    <View style={[styles.wrapper, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
      <View style={styles.topRow}>
        <Pressable
          onPress={onEditDate}
          style={({ pressed }) => [styles.countdown, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={`${countdown}. ${progress.done} of ${progress.total} milestones done.`}
          accessibilityHint={weddingDate ? 'Change the wedding date' : 'Set the wedding date'}
        >
          <Text style={[styles.countdownText, { color: colors.primary }]}>{countdown}</Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {weddingDate ? formatDate(weddingDate, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) : 'Planning by stage'}
            {'  ·  '}
            {progress.done} of {progress.total} done
          </Text>
          <Text style={[styles.dateLink, { color: colors.accent }]}>
            {weddingDate ? 'Change date' : 'Set your date'}
          </Text>
        </Pressable>
        <ProgressRing percent={progress.percent} />
        <Pressable
          onPress={onOpenReminders}
          accessibilityRole="button"
          accessibilityLabel={remindersOn ? 'Reminders are on' : 'Turn on reminders'}
          hitSlop={8}
          style={({ pressed }) => [
            styles.bellButton,
            { borderColor: colors.border, backgroundColor: colors.card },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Ionicons name={remindersOn ? 'notifications' : 'notifications-outline'} size={18} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.controls}>
        <View
          style={[styles.segmented, { backgroundColor: colors.secondary }]}
          accessibilityRole="tablist"
        >
          {VIEWS.map((option) => {
            const selected = option.key === view;
            return (
              <Pressable
                key={option.key}
                onPress={() => onChangeView(option.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.segment, selected && [styles.segmentSelected, { backgroundColor: colors.card }]]}
              >
                <Text
                  style={[styles.segmentText, { color: selected ? colors.primary : colors.mutedForeground }]}
                  maxFontSizeMultiplier={1.4}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={onOpenCouple}
          accessibilityRole="button"
          accessibilityLabel={partnerJoined ? 'Your plan together' : 'Invite your partner'}
          hitSlop={8}
          style={({ pressed }) => [
            styles.coupleButton,
            { borderColor: colors.border, backgroundColor: colors.card },
            pressed && { opacity: 0.8 },
          ]}
        >
          {partnerJoined ? (
            <Text style={[styles.coupleText, { color: colors.primary }]} maxFontSizeMultiplier={1.2}>
              {coupleInitials}
            </Text>
          ) : (
            <Ionicons name="person-add-outline" size={18} color={colors.primary} />
          )}
        </Pressable>
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add a milestone"
          hitSlop={8}
          style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="add" size={22} color={colors.primaryForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  countdown: { flex: 1 },
  countdownText: { fontFamily: fonts.serifBold, fontSize: 26, letterSpacing: -0.4 },
  meta: { fontFamily: fonts.sans, fontSize: 13, marginTop: 2 },
  dateLink: { fontFamily: fonts.sansMedium, fontSize: 13, marginTop: 4 },
  ringText: { fontFamily: fonts.sansSemiBold, fontSize: 13 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  segmented: { flex: 1, flexDirection: 'row', borderRadius: 10, padding: 3 },
  segment: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  segmentSelected: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { fontFamily: fonts.sansMedium, fontSize: 13 },
  coupleButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coupleText: { fontFamily: fonts.serifBold, fontSize: 13, letterSpacing: 0.5 },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  addButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
