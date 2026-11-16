import React, { useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import { accessibilityLabelFor, formatDate, stateLabel, type Journey, type JourneyNode } from '@/lib/journey';

interface Props {
  journey: Journey;
  onOpenMilestone: (node: JourneyNode) => void;
}

/** The same journey as a plain list, grouped by phase. Fully Dynamic Type friendly. */
export function JourneyList({ journey, onOpenMilestone }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const sections = useMemo(() => {
    const byId = new Map(journey.nodes.map((node) => [node.id, node]));
    return journey.phases.map((phase) => ({
      key: phase.key,
      title: phase.label,
      data: phase.milestoneIds.map((id) => byId.get(id)).filter((node): node is JourneyNode => !!node),
    }));
  }, [journey]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => String(item.id)}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 32 }}
      renderSectionHeader={({ section }) => (
        <Text accessibilityRole="header" style={[styles.section, { color: colors.accent }]}>
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => <Row node={item} onPress={() => onOpenMilestone(item)} />}
    />
  );
}

function Row({ node, onPress }: { node: JourneyNode; onPress: () => void }) {
  const colors = useColors();
  const tone =
    node.state === 'overdue'
      ? colors.warning
      : node.state === 'done'
        ? colors.success
        : node.state === 'current'
          ? colors.accent
          : colors.mutedForeground;
  const icon =
    node.state === 'done'
      ? 'checkmark-circle'
      : node.state === 'skipped'
        ? 'remove-circle-outline'
        : node.state === 'overdue'
          ? 'time-outline'
          : node.isCustom
            ? 'diamond-outline'
            : 'ellipse-outline';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabelFor(node)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: node.isCurrent ? colors.accent : colors.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={24} color={tone} />
      <View style={styles.body}>
        <Text
          style={[
            styles.title,
            { color: node.state === 'skipped' ? colors.mutedForeground : colors.primary },
            node.state === 'skipped' && { textDecorationLine: 'line-through' },
          ]}
        >
          {node.title}
        </Text>
        <Text style={[styles.meta, { color: tone }]}>
          {stateLabel(node.state)}
          {node.dueDate ? ` · ${formatDate(node.dueDate)}` : ''}
          {node.tasks.length > 0 ? ` · ${node.tasksDone}/${node.tasks.length} tasks` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  body: { flex: 1 },
  title: { fontFamily: fonts.sansSemiBold, fontSize: 15 },
  meta: { fontFamily: fonts.sans, fontSize: 13, marginTop: 2 },
});
