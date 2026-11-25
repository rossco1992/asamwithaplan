import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import { formatLongDate, SCHEDULABLE_PHASES, stateLabel, type JourneyNode } from '@/lib/journey';
import type { JourneyActions } from '@/hooks/useJourney';
import { confirmAction } from '@/lib/confirm';

interface Props {
  node: JourneyNode | null;
  actions: JourneyActions;
  error: string | null;
  onClose: () => void;
}

export function MilestoneSheet({ node, actions, error, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [newTask, setNewTask] = useState('');
  const [busy, setBusy] = useState(false);

  if (!node) return null;

  const phaseLabel =
    node.phase === 'pinned'
      ? 'Your set dates'
      : SCHEDULABLE_PHASES.find((phase) => phase.key === node.phase)?.label ?? '';

  const run = async (work: () => Promise<boolean>, haptic?: Haptics.NotificationFeedbackType) => {
    setBusy(true);
    const ok = await work();
    setBusy(false);
    if (ok && haptic) Haptics.notificationAsync(haptic);
    return ok;
  };

  const toggleDone = () =>
    run(
      () => actions.setMilestoneStatus(node.id, node.status === 'done' ? 'todo' : 'done'),
      node.status === 'done' ? undefined : Haptics.NotificationFeedbackType.Success,
    );

  const toggleSkipped = () =>
    run(() => actions.setMilestoneStatus(node.id, node.status === 'skipped' ? 'todo' : 'skipped'));

  const confirmDelete = () => {
    confirmAction({
      title: 'Delete this milestone?',
      message: `"${node.title}" and its tasks will be removed.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        if (await run(() => actions.deleteMilestone(node.id))) onClose();
      },
    });
  };

  const addTask = async () => {
    const title = newTask.trim();
    if (!title) return;
    if (await run(() => actions.addTask(node.id, title))) setNewTask('');
  };

  let when: string;
  if (node.dueDate) {
    when = `${node.state === 'overdue' ? 'Was due' : 'Due'} ${formatLongDate(node.dueDate)}`;
  } else {
    when = 'Set a wedding date to see the exact day';
  }
  const moves =
    node.schedule === 'relative'
      ? 'Moves with your wedding date'
      : 'Pinned to this date';

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grabberRow}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
        </View>
        <View style={styles.headerRow}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>
            {phaseLabel}
            {node.isCustom ? '  ·  Added by you' : ''}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
            <Ionicons name="close-circle" size={28} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={[styles.title, { color: colors.primary }]}>
            {node.title}
          </Text>
          <View style={styles.whenRow}>
            <Ionicons
              name={node.state === 'overdue' ? 'time-outline' : 'calendar-outline'}
              size={16}
              color={node.state === 'overdue' ? colors.warning : colors.mutedForeground}
            />
            <Text style={[styles.when, { color: node.state === 'overdue' ? colors.warning : colors.mutedForeground }]}>
              {when}
            </Text>
          </View>
          <Text style={[styles.moves, { color: colors.mutedForeground }]}>
            {stateLabel(node.state)} · {moves}
          </Text>
          {node.notes ? <Text style={[styles.notes, { color: colors.foreground }]}>{node.notes}</Text> : null}

          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            Tasks · {node.tasksDone} of {node.tasks.length}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {node.tasks.map((task, index) => (
              <Pressable
                key={task.id}
                onPress={() => {
                  Haptics.selectionAsync();
                  run(() => actions.setTaskDone(node.id, task.id, !task.done));
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: task.done }}
                accessibilityLabel={task.title}
                style={[
                  styles.taskRow,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                ]}
              >
                <Ionicons
                  name={task.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={task.done ? colors.success : colors.border}
                />
                <Text
                  style={[
                    styles.taskTitle,
                    { color: task.done ? colors.mutedForeground : colors.foreground },
                    task.done && { textDecorationLine: 'line-through' },
                  ]}
                >
                  {task.title}
                </Text>
              </Pressable>
            ))}
            <View
              style={[
                styles.taskRow,
                node.tasks.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}
            >
              <Ionicons name="add-circle-outline" size={24} color={colors.accent} />
              <TextInput
                value={newTask}
                onChangeText={setNewTask}
                onSubmitEditing={addTask}
                placeholder="Add a task"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
                maxLength={200}
                accessibilityLabel="New task"
                style={[styles.taskInput, { color: colors.foreground }]}
              />
            </View>
          </View>

          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.actions}>
          {node.status !== 'skipped' ? (
            <Pressable
              onPress={toggleDone}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.primary,
                { backgroundColor: node.status === 'done' ? colors.secondary : colors.primary },
                pressed && { opacity: 0.85 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={node.status === 'done' ? colors.primary : colors.primaryForeground} />
              ) : (
                <Text
                  style={[
                    styles.primaryText,
                    { color: node.status === 'done' ? colors.primary : colors.primaryForeground },
                  ]}
                >
                  {node.status === 'done' ? 'Reopen' : 'Mark as done'}
                </Text>
              )}
            </Pressable>
          ) : null}
          {node.isCustom ? (
            <Pressable onPress={confirmDelete} disabled={busy} accessibilityRole="button" style={styles.secondary}>
              <Text style={[styles.secondaryText, { color: colors.destructive }]}>Delete milestone</Text>
            </Pressable>
          ) : (
            <Pressable onPress={toggleSkipped} disabled={busy} accessibilityRole="button" style={styles.secondary}>
              <Text style={[styles.secondaryText, { color: colors.mutedForeground }]}>
                {node.status === 'skipped' ? 'Bring this step back' : "Skip, this isn't for us"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  grabberRow: { alignItems: 'center', paddingTop: 8 },
  grabber: { width: 36, height: 5, borderRadius: 3 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  eyebrow: { fontFamily: fonts.sansSemiBold, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  title: { fontFamily: fonts.serifBold, fontSize: 30, letterSpacing: -0.5, lineHeight: 36 },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  when: { fontFamily: fonts.sansMedium, fontSize: 15 },
  moves: { fontFamily: fonts.sans, fontSize: 13, marginTop: 4 },
  notes: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, marginTop: 16 },
  sectionTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 10,
  },
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 52 },
  taskTitle: { flex: 1, fontFamily: fonts.sans, fontSize: 16, paddingVertical: 14 },
  taskInput: { flex: 1, fontFamily: fonts.sans, fontSize: 16, paddingVertical: 14 },
  error: { fontFamily: fonts.sans, fontSize: 14, marginTop: 12 },
  actions: { paddingHorizontal: 20, gap: 4 },
  primary: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fonts.sansSemiBold, fontSize: 16 },
  secondary: { height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fonts.sansMedium, fontSize: 15 },
});
