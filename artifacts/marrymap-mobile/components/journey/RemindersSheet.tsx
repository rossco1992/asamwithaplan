import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Switch, Platform, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import type { ReminderControls } from '@/hooks/useReminders';

interface Props {
  visible: boolean;
  reminders: ReminderControls;
  /** Open milestones with a date, so there's something to remind about. */
  remindable: number;
  hasWeddingDate: boolean;
  onClose: () => void;
}

/** Turn this phone's milestone reminders on or off, and say what they'll do. */
export function RemindersSheet({ visible, reminders, remindable, hasWeddingDate, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const { status, recheck } = reminders;

  // Coming back from the phone's Settings may have changed the permission.
  useEffect(() => {
    if (!visible) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') recheck();
    });
    return () => subscription.remove();
  }, [visible, recheck]);

  const toggle = async (on: boolean) => {
    Haptics.selectionAsync();
    setBusy(true);
    try {
      if (on) await reminders.enable();
      else await reminders.disable();
    } finally {
      setBusy(false);
    }
  };

  let note: string | null = null;
  if (status === 'on') {
    if (remindable === 0) {
      note = hasWeddingDate
        ? "Nothing to remind you about right now. New milestones with a date get reminders as you add them."
        : 'Reminders start once you set a date. Milestones you gave their own date get reminders already.';
    } else {
      note = `On for ${remindable === 1 ? '1 milestone' : `${remindable} milestones`} on this phone.`;
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.toolbar}>
          <View style={styles.toolbarSide} />
          <Text style={[styles.toolbarTitle, { color: colors.primary }]} accessibilityRole="header">
            Reminders
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10} style={styles.toolbarSide}>
            <Text style={[styles.toolbarText, { color: colors.accent }]}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={[styles.title, { color: colors.primary }]}>Milestone reminders</Text>
                <Text style={[styles.help, { color: colors.mutedForeground }]}>
                  A week before each milestone is due, and again on the day, at 9 AM.
                </Text>
              </View>
              {status === 'unsupported' ? null : (
                <Switch
                  value={status === 'on'}
                  disabled={busy || status === 'loading'}
                  onValueChange={toggle}
                  accessibilityLabel="Milestone reminders"
                  trackColor={{ true: colors.accent, false: colors.secondary }}
                />
              )}
            </View>

            {note ? <Text style={[styles.help, { color: colors.mutedForeground }]}>{note}</Text> : null}

            {status === 'blocked' ? (
              <View style={styles.blocked}>
                <View style={styles.blockedRow}>
                  <Ionicons name="notifications-off-outline" size={16} color={colors.destructive} />
                  <Text style={[styles.help, styles.flex, { color: colors.destructive }]}>
                    Notifications are off for this app in your phone's settings.
                  </Text>
                </View>
                <Pressable
                  onPress={reminders.openSettings}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary }, pressed && styles.pressed]}
                >
                  <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Open Settings</Text>
                </Pressable>
              </View>
            ) : null}

            {status === 'unsupported' ? (
              <Text style={[styles.help, { color: colors.mutedForeground }]}>
                Reminders work in the iPhone and Android app.
              </Text>
            ) : null}
          </View>

          <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
            Reminders are set on this phone only, so your partner turns them on for theirs. Done and skipped
            milestones don't get reminders, and changes either of you make move them the next time you open the
            app.
          </Text>
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
  toolbarSide: { minWidth: 48, alignItems: 'flex-end' },
  toolbarText: { fontFamily: fonts.sansSemiBold, fontSize: 16 },
  toolbarTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16 },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 4 },
  flex: { flex: 1 },
  title: { fontFamily: fonts.sansSemiBold, fontSize: 16 },
  help: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  footnote: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, paddingHorizontal: 4 },
  blocked: { gap: 12 },
  blockedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  primary: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fonts.sansSemiBold, fontSize: 16 },
  pressed: { opacity: 0.85 },
});
