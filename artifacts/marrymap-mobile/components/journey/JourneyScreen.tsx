import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import { useJourney } from '@/hooks/useJourney';
import { GeneratingState } from '@/components/GeneratingState';
import { TimelineView } from '@/components/TimelineView';
import { JourneyHeader, type JourneyView } from '@/components/journey/JourneyHeader';
import { JourneyMap } from '@/components/journey/JourneyMap';
import { JourneyList } from '@/components/journey/JourneyList';
import { MilestoneSheet } from '@/components/journey/MilestoneSheet';
import { AddMilestoneSheet } from '@/components/journey/AddMilestoneSheet';
import { DateSheet } from '@/components/journey/DateSheet';
import { CoupleSheet } from '@/components/journey/CoupleSheet';
import { RemindersSheet } from '@/components/journey/RemindersSheet';
import { useReminders } from '@/hooks/useReminders';
import { remindableCount } from '@/lib/reminders';
import { useCouple } from '@/hooks/useCouple';
import { coupleInitials, partnerOf } from '@/lib/couple';
import type { JourneyNode, PhaseKey } from '@/lib/journey';
import type { TimelineData, WeddingData } from '@/app/(home)/index';

interface Props {
  wedding: WeddingData;
  timeline: TimelineData;
  initials: string;
  /** The date changed here, so the rest of the app shows it too. */
  onWeddingDateChange: (weddingDate: string | null) => void;
  /** This partner left the plan. */
  onLeft: () => void;
}

/** Home once a wedding exists: the journey map, its list view, and Sam's week-by-week plan. */
export function JourneyScreen({ wedding, timeline, initials, onWeddingDateChange, onLeft }: Props) {
  const colors = useColors();
  const { state, actions, error } = useJourney(wedding.id);
  const couple = useCouple(wedding.id);
  const [editingDate, setEditingDate] = useState(false);
  const [coupleOpen, setCoupleOpen] = useState(false);
  const members = couple.couple?.members ?? [];
  const mapInitials = coupleInitials(members, initials);
  const partnerJoined = partnerOf(members) !== null;
  const [view, setView] = useState<JourneyView>('map');
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState<{ phase: PhaseKey | null } | null>(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  // A tap on a reminder opens its milestone; the sheet shows once the journey has loaded.
  const reminders = useReminders(state.kind === 'ready' ? state.journey : null, setOpenId);

  const openMilestone = useCallback((node: JourneyNode) => {
    Haptics.selectionAsync();
    setOpenId(node.id);
  }, []);

  const addNear = useCallback((phase: PhaseKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAdding({ phase });
  }, []);

  // The other partner removed this person, or deleted the plan.
  const lostAccess = state.kind === 'error' && state.status === 404;
  useEffect(() => {
    if (lostAccess) onLeft();
  }, [lostAccess, onLeft]);

  if (state.kind === 'loading') return <GeneratingState />;

  if (state.kind === 'error') {
    return (
      <View style={styles.centre}>
        <Text style={[styles.errorTitle, { color: colors.primary }]}>We couldn't load your journey</Text>
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{state.message}</Text>
        <Pressable
          onPress={actions.refresh}
          accessibilityRole="button"
          style={({ pressed }) => [styles.retry, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
        >
          <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const { journey } = state;
  // Re-read the open milestone from the latest journey so the sheet reflects every change.
  const openNode = openId === null ? null : journey.nodes.find((node) => node.id === openId) ?? null;

  return (
    <View style={styles.fill}>
      <JourneyHeader
        journey={journey}
        view={view}
        onChangeView={(next) => {
          Haptics.selectionAsync();
          setView(next);
        }}
        onAdd={() => setAdding({ phase: null })}
        onEditDate={() => setEditingDate(true)}
        onOpenCouple={() => setCoupleOpen(true)}
        onOpenReminders={() => setRemindersOpen(true)}
        remindersOn={reminders.status === 'on'}
        remindersAvailable={reminders.status !== 'unsupported'}
        coupleInitials={mapInitials}
        partnerJoined={partnerJoined}
      />

      {view === 'map' ? (
        <JourneyMap journey={journey} initials={mapInitials} onOpenMilestone={openMilestone} onAddNear={addNear} />
      ) : null}
      {view === 'list' ? <JourneyList journey={journey} onOpenMilestone={openMilestone} /> : null}
      {view === 'plan' ? <TimelineView timeline={timeline} wedding={wedding} /> : null}

      <MilestoneSheet node={openNode} actions={actions} error={error} onClose={() => setOpenId(null)} />
      <AddMilestoneSheet
        visible={adding !== null}
        initialPhase={adding?.phase ?? null}
        weddingDate={journey.weddingDate}
        today={journey.today}
        actions={actions}
        error={error}
        onClose={() => setAdding(null)}
      />
      <DateSheet
        visible={editingDate}
        weddingDate={journey.weddingDate}
        today={journey.today}
        couple={couple}
        onSaved={(next) => {
          onWeddingDateChange(next);
          actions.refresh();
        }}
        onClose={() => setEditingDate(false)}
      />
      <RemindersSheet
        visible={remindersOpen}
        reminders={reminders}
        remindable={remindableCount(journey)}
        hasWeddingDate={journey.weddingDate !== null}
        onClose={() => setRemindersOpen(false)}
      />
      <CoupleSheet visible={coupleOpen} couple={couple} onLeft={onLeft} onClose={() => setCoupleOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  errorTitle: { fontFamily: fonts.serifBold, fontSize: 22, textAlign: 'center' },
  errorText: { fontFamily: fonts.sans, fontSize: 15, textAlign: 'center' },
  retry: { marginTop: 16, paddingHorizontal: 24, height: 48, borderRadius: 14, justifyContent: 'center' },
  retryText: { fontFamily: fonts.sansSemiBold, fontSize: 16 },
});
