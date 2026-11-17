import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import { CalendarPicker } from '@/components/journey/CalendarPicker';
import { formatDate, formatLongDate } from '@/lib/journey';
import type { DatePreview } from '@/lib/couple';
import type { CoupleActions } from '@/hooks/useCouple';

interface Props {
  visible: boolean;
  weddingDate: string | null;
  today: string;
  couple: CoupleActions;
  onSaved: (weddingDate: string | null) => void;
  onClose: () => void;
}

type Mode = 'date' | 'undecided';

/**
 * Set, change or clear the wedding date. Before saving it shows what the
 * change does to the journey, so nothing moves by surprise.
 */
export function DateSheet({ visible, weddingDate, today, couple, onSaved, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('date');
  const [date, setDate] = useState<string | null>(weddingDate);
  const [preview, setPreview] = useState<DatePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setMode('date');
    setDate(weddingDate);
    setPreview(null);
    setError(null);
  }, [visible, weddingDate]);

  const next = mode === 'undecided' ? null : date;
  const changed = next !== weddingDate && (mode === 'undecided' || date !== null);

  // Ask what would move whenever the choice changes.
  useEffect(() => {
    if (!visible || !changed) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    couple.previewDate(next).then((result) => {
      if (!cancelled && result.ok) setPreview(result.data);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, next, changed]);

  const save = async () => {
    if (!changed || busy) return;
    setBusy(true);
    setError(null);
    const result = await couple.setWeddingDate(next);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved(result.data.wedding.weddingDate);
    onClose();
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
            Wedding date
          </Text>
          <Pressable
            onPress={save}
            disabled={!changed || busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: !changed || busy }}
            hitSlop={10}
          >
            {busy ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={[styles.toolbarText, styles.save, { color: changed ? colors.accent : colors.border }]}>
                Save
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.segmented, { backgroundColor: colors.secondary }]} accessibilityRole="tablist">
            {(['date', 'undecided'] as Mode[]).map((option) => {
              const selected = option === mode;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setMode(option);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  style={[styles.segment, selected && { backgroundColor: colors.card }]}
                >
                  <Text style={[styles.segmentText, { color: selected ? colors.primary : colors.mutedForeground }]}>
                    {option === 'date' ? 'We have a date' : 'Not decided yet'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mode === 'date' ? (
            <>
              <Text style={[styles.chosen, { color: colors.primary }]}>
                {date ? formatLongDate(date) : 'Pick your day'}
              </Text>
              <CalendarPicker value={date} initialMonth={weddingDate ?? today} weddingDate={weddingDate} onChange={setDate} />
            </>
          ) : (
            <Text style={[styles.help, { color: colors.mutedForeground }]}>
              Your journey stays grouped by stage until you pick a date. Milestones you pinned to a date keep it.
            </Text>
          )}

          {preview ? <PreviewSummary preview={preview} /> : null}

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

/** One short card on what the change does, in plain words. */
function PreviewSummary({ preview }: { preview: DatePreview }) {
  const colors = useColors();
  const lines: string[] = [];
  const moved = preview.moved.length;
  if (moved > 0) lines.push(`${moved} milestone${moved === 1 ? '' : 's'} will move with the new date.`);
  const overdue = preview.nowOverdue.length;
  if (overdue > 0) {
    const names = preview.nowOverdue.slice(0, 3).map((item) => item.title).join(', ');
    lines.push(`${overdue} would already be overdue: ${names}${overdue > 3 ? ', and more' : ''}.`);
  }
  for (const item of preview.fixedAfterWedding.slice(0, 2)) {
    lines.push(`"${item.title}" stays on ${formatDate(item.date)}, which would be after the wedding.`);
  }
  if (lines.length === 0) lines.push('Nothing on your journey moves.');

  return (
    <View
      accessible
      accessibilityLabel={lines.join(' ')}
      style={[styles.preview, { backgroundColor: overdue > 0 ? colors.warningSoft : colors.card, borderColor: colors.border }]}
    >
      <Text style={[styles.previewTitle, { color: colors.primary }]}>What changes</Text>
      {lines.map((line) => (
        <Text key={line} style={[styles.previewLine, { color: colors.foreground }]}>
          {line}
        </Text>
      ))}
    </View>
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
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  segmented: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentText: { fontFamily: fonts.sansMedium, fontSize: 14 },
  chosen: { fontFamily: fonts.serifBold, fontSize: 22 },
  help: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  preview: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 6 },
  previewTitle: { fontFamily: fonts.sansSemiBold, fontSize: 14 },
  previewLine: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  error: { fontFamily: fonts.sans, fontSize: 14, flex: 1 },
});
