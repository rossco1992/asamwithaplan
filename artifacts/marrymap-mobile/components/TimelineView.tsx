import React, { useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import type { TimelineData, TimelineTask, TimelineWeek, WeddingData } from '@/app/(home)/index';

type Priority = 'urgent' | 'this-week' | 'upcoming';

const PRIORITY_STYLES: Record<Priority, { label: string; bg: string; text: string; border: string }> = {
  urgent:      { label: 'Urgent',    bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  'this-week': { label: 'This week', bg: '#fdf3ef', text: '#c28070', border: '#f5c9bc' },
  upcoming:    { label: 'Upcoming',  bg: '#f2f0ed', text: '#525c7a', border: '#ded9d3' },
};

function PriorityBadge({ priority }: { priority: Priority }) {
  const cfg = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.upcoming;
  return (
    <View style={[badgeStyles.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Text style={[badgeStyles.label, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 3,
  },
  label: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});

function TaskItem({ task }: { task: TimelineTask }) {
  const colors = useColors();
  return (
    <View style={[taskStyles.row]}>
      <View style={[taskStyles.dot, { backgroundColor: colors.accent }]} />
      <View style={taskStyles.body}>
        <Text style={[taskStyles.title, { color: colors.foreground }]}>{task.title}</Text>
        <PriorityBadge priority={task.priority} />
      </View>
    </View>
  );
}

const taskStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  body: { flex: 1 },
  title: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
});

function WeekCard({ week, colors }: { week: TimelineWeek; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[weekStyles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[weekStyles.weekLabel, { color: colors.mutedForeground }]}>{week.weekLabel}</Text>
      {week.tasks.map((task, i) => <TaskItem key={i} task={task} />)}
    </View>
  );
}

const weekStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  weekLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
});

interface Props {
  timeline: TimelineData;
  wedding: WeddingData;
}

export function TimelineView({ timeline, wedding }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // Build SectionList data from phases
  const sections = useMemo(() => {
    const phases = Array.from(new Set(timeline.tasks.map(w => w.phase)));
    return phases.map(phase => ({
      phase,
      data: timeline.tasks.filter(w => w.phase === phase),
    }));
  }, [timeline]);

  const s = useMemo(() => makeStyles(colors, insets), [colors, insets]);

  const weddingDateFormatted = useMemo(() => {
    try {
      return new Date(wedding.weddingDate + 'T12:00:00').toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
    } catch { return wedding.weddingDate; }
  }, [wedding.weddingDate]);

  const ListHeader = (
    <View style={s.header}>
      <Text style={s.eyebrow}>Your plan</Text>
      <Text style={s.city}>{wedding.city}</Text>
      <Text style={s.date}>{weddingDateFormatted}</Text>
      <Text style={s.meta}>
        {timeline.tasks.length} weeks · {wedding.guestCount} guests · {wedding.style}
      </Text>
    </View>
  );

  return (
    <SectionList
      style={s.list}
      contentContainerStyle={s.content}
      sections={sections}
      keyExtractor={(item, idx) => `${item.phase}-${idx}`}
      renderItem={({ item }) => <WeekCard week={item} colors={colors} />}
      renderSectionHeader={({ section }) => (
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>{section.phase}</Text>
          <View style={s.sectionLine} />
        </View>
      )}
      ListHeaderComponent={ListHeader}
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
    />
  );
}

function makeStyles(colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) {
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  return StyleSheet.create({
    list: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingHorizontal: 20,
      paddingBottom: bottomPad + 24,
    },
    header: { paddingTop: 28, paddingBottom: 24 },
    eyebrow: {
      fontFamily: fonts.sansSemiBold,
      fontSize: 11,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: colors.accent,
      marginBottom: 8,
    },
    city: {
      fontFamily: fonts.serifBold,
      fontSize: 28,
      color: colors.primary,
      letterSpacing: -0.5,
    },
    date: {
      fontFamily: fonts.serif,
      fontSize: 18,
      color: colors.primary,
      marginBottom: 6,
    },
    meta: {
      fontFamily: fonts.sans,
      fontSize: 13,
      color: colors.mutedForeground,
    },
    sectionHeader: {
      marginBottom: 16,
      marginTop: 8,
    },
    sectionTitle: {
      fontFamily: fonts.sansSemiBold,
      fontSize: 11,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: colors.mutedForeground,
      marginBottom: 8,
    },
    sectionLine: { height: 1, backgroundColor: colors.border },
  });
}
