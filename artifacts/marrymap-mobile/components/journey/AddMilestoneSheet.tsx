import React, { useEffect, useState } from 'react';
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
import { CalendarPicker } from '@/components/journey/CalendarPicker';
import { formatLongDate, SCHEDULABLE_PHASES, type PhaseKey } from '@/lib/journey';
import type { JourneyActions } from '@/hooks/useJourney';

interface Props {
  visible: boolean;
  /** Phase picked by long-pressing a stop on the map. */
  initialPhase: PhaseKey | null;
  weddingDate: string | null;
  today: string;
  actions: JourneyActions;
  error: string | null;
  onClose: () => void;
}

type WhenMode = 'phase' | 'date';

export function AddMilestoneSheet({ visible, initialPhase, weddingDate, today, actions, error, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<WhenMode>('phase');
  const [phase, setPhase] = useState<PhaseKey>('three-to-six');
  const [date, setDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Start fresh each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setNotes('');
    setDate(null);
    setMode('phase');
    setPhase(initialPhase && initialPhase !== 'pinned' ? initialPhase : 'three-to-six');
  }, [visible, initialPhase]);

  const canSave = title.trim().length > 0 && (mode === 'phase' || date !== null) && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    const ok = await actions.addMilestone({
      title: title.trim(),
      notes: notes.trim() || undefined,
      when: mode === 'date' && date ? { kind: 'date', date } : { kind: 'phase', phase },
    });
    setBusy(false);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.toolbar}>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10}>
            <Text style={[styles.toolbarText, { color: colors.mutedForeground }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.toolbarTitle, { color: colors.primary }]} accessibilityRole="header">
            New milestone
          </Text>
          <Pressable
            onPress={save}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
            hitSlop={10}
          >
            {busy ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={[styles.toolbarText, styles.save, { color: canSave ? colors.accent : colors.border }]}>Add</Text>
            )}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Engagement party, cake tasting…"
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            maxLength={120}
            returnKeyType="done"
            accessibilityLabel="Milestone name"
            style={[styles.titleInput, { color: colors.primary, borderBottomColor: colors.border }]}
          />

          <Text style={[styles.label, { color: colors.mutedForeground }]}>When</Text>
          <View style={[styles.segmented, { backgroundColor: colors.secondary }]} accessibilityRole="tablist">
            {(['phase', 'date'] as WhenMode[]).map((option) => {
              const selected = option === mode;
              return (
                <Pressable
                  key={option}
                  onPress={() => setMode(option)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  style={[styles.segment, selected && { backgroundColor: colors.card }]}
                >
                  <Text style={[styles.segmentText, { color: selected ? colors.primary : colors.mutedForeground }]}>
                    {option === 'phase' ? 'Around a stage' : 'On a set date'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mode === 'phase' ? (
            <>
              <Text style={[styles.help, { color: colors.mutedForeground }]}>
                Moves with your wedding date if it changes.
              </Text>
              <View style={styles.chips}>
                {SCHEDULABLE_PHASES.map((option) => {
                  const selected = option.key === phase;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setPhase(option.key);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected ? colors.primary : colors.card,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: selected ? colors.primaryForeground : colors.foreground }]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.help, { color: colors.mutedForeground }]}>
                {date ? formatLongDate(date) : 'Stays put even if your wedding date moves.'}
              </Text>
              <CalendarPicker value={date} initialMonth={today} weddingDate={weddingDate} onChange={setDate} />
            </>
          )}

          <Text style={[styles.label, { color: colors.mutedForeground }]}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional"
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={2000}
            accessibilityLabel="Notes"
            style={[styles.notes, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
          />

          {error ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.destructive} />
              <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  toolbarText: { fontFamily: fonts.sansMedium, fontSize: 16 },
  toolbarTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16 },
  save: { fontFamily: fonts.sansSemiBold },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  titleInput: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 10,
  },
  segmented: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentText: { fontFamily: fonts.sansMedium, fontSize: 14 },
  help: { fontFamily: fonts.sans, fontSize: 13, marginTop: 10, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontFamily: fonts.sansMedium, fontSize: 14 },
  notes: {
    minHeight: 96,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontFamily: fonts.sans,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  error: { fontFamily: fonts.sans, fontSize: 14, flex: 1 },
});
