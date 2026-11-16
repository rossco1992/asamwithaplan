import React, { useCallback, useState } from 'react';
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
import type { JourneyNode, PhaseKey } from '@/lib/journey';
import type { TimelineData, WeddingData } from '@/app/(home)/index';

interface Props {
  wedding: WeddingData;
  timeline: TimelineData;
  initials: string;
}

/** Home once a wedding exists: the journey map, its list view, and Sam's week-by-week plan. */
export function JourneyScreen({ wedding, timeline, initials }: Props) {
  const colors = useColors();
  const { state, actions, error } = useJourney(wedding.id);
  const [view, setView] = useState<JourneyView>('map');
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState<{ phase: PhaseKey | null } | null>(null);

  const openMilestone = useCallback((node: JourneyNode) => {
    Haptics.selectionAsync();
    setOpenId(node.id);
  }, []);

  const addNear = useCallback((phase: PhaseKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAdding({ phase });
  }, []);

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
      />

      {view === 'map' ? (
        <JourneyMap journey={journey} initials={initials} onOpenMilestone={openMilestone} onAddNear={addNear} />
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
