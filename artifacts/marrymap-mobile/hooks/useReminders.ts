import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { Journey } from '@/lib/journey';
import { planReminders, planSignature, REMINDER_HOUR, type PlannedReminder } from '@/lib/reminders';
import { createReminderSync } from '@/lib/reminderSync';

const ENABLED_KEY = 'reminders:enabled';
const SIGNATURE_KEY = 'reminders:signature';
const CHANNEL_ID = 'milestones';
/** Marks the notifications this file schedules, so it never touches anything else. */
const SOURCE = 'milestone-reminder';

/**
 * off: they turned reminders off, or never turned them on.
 * on: reminders are scheduled on this phone.
 * blocked: the phone's settings don't allow this app's notifications.
 * unsupported: the web build, which can't schedule notifications.
 */
export type ReminderStatus = 'loading' | 'off' | 'on' | 'blocked' | 'unsupported';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

// Show a reminder that arrives while the app is open, too.
if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function readEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === 'on';
  } catch {
    return false;
  }
}

async function ourScheduled(): Promise<Notifications.NotificationRequest[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.filter((request) => request.content.data?.source === SOURCE);
}

/** The phone's side of the reminder sync: expo-notifications and AsyncStorage. */
const reminderSync = createReminderSync({
  scheduledIds: async () => (await ourScheduled()).map((request) => request.identifier),
  cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
  schedule: async (reminder: PlannedReminder) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: reminder.title,
        body: reminder.body,
        data: { source: SOURCE, milestoneId: reminder.milestoneId, day: reminder.day },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.fireAt,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
    });
  },
  readSignature: () => AsyncStorage.getItem(SIGNATURE_KEY),
  writeSignature: async (signature) => {
    if (signature === null) await AsyncStorage.removeItem(SIGNATURE_KEY);
    else await AsyncStorage.setItem(SIGNATURE_KEY, signature);
  },
  isEnabled: readEnabled,
  forgetEnabled: () => AsyncStorage.removeItem(ENABLED_KEY),
  prepare: async () => {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Milestone reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  },
});

/**
 * Removes every milestone reminder from this phone. Safe to call at any time.
 * It also stops any rescheduling that is still running or waiting, so nothing
 * comes back after it.
 */
export async function cancelMilestoneReminders(options: { forget?: boolean } = {}): Promise<void> {
  if (!supported) return;
  try {
    await reminderSync.cancel(options);
  } catch {
    // Nothing to clean up, or the OS refused; either way there's nothing more to do.
  }
}

/**
 * Keeps this phone's milestone reminders in step with the journey. Turning
 * them on asks the phone for permission; nothing is asked before that.
 * Each partner turns reminders on for their own phone.
 */
export function useReminders(journey: Journey | null, onOpenMilestone: (milestoneId: number) => void) {
  const [status, setStatus] = useState<ReminderStatus>(supported ? 'loading' : 'unsupported');
  const [scheduledCount, setScheduledCount] = useState(0);
  const openRef = useRef(onOpenMilestone);
  openRef.current = onOpenMilestone;

  // Work out where things stand on this phone.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      const enabled = await readEnabled();
      if (!enabled) {
        if (!cancelled) setStatus('off');
        return;
      }
      const permission = await Notifications.getPermissionsAsync();
      if (cancelled) return;
      setStatus(permission.granted ? 'on' : 'blocked');
    })().catch(() => {
      if (!cancelled) setStatus('off');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reschedule whenever the plan for this phone changes. A newer plan, or the
  // screen going away, calls off a run that hasn't finished.
  useEffect(() => {
    if (status !== 'on' || !journey) return;
    const planned = planReminders(journey);
    const signature = planSignature(planned, REMINDER_HOUR);
    let live = true;
    reminderSync
      .sync(planned, signature, () => live)
      .then((outcome) => {
        if (live && outcome !== 'stopped') setScheduledCount(planned.length);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [status, journey]);

  // A tap on a reminder opens its milestone, whether the app was running or not.
  useEffect(() => {
    if (!supported) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data;
      if (data?.source !== SOURCE) return;
      const id = Number(data.milestoneId);
      if (Number.isInteger(id) && id > 0) openRef.current(id);
    };
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        open(response);
        if (response) Notifications.clearLastNotificationResponseAsync().catch(() => {});
      })
      .catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);

  const enable = useCallback(async (): Promise<ReminderStatus> => {
    if (!supported) return 'unsupported';
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Notifications.requestPermissionsAsync();
    }
    await AsyncStorage.setItem(ENABLED_KEY, 'on');
    const next: ReminderStatus = permission.granted ? 'on' : 'blocked';
    setStatus(next);
    return next;
  }, []);

  const disable = useCallback(async () => {
    if (!supported) return;
    await AsyncStorage.setItem(ENABLED_KEY, 'off');
    await cancelMilestoneReminders();
    setScheduledCount(0);
    setStatus('off');
  }, []);

  /** Back from the phone's Settings: pick up a permission they just granted. */
  const recheck = useCallback(async () => {
    if (!supported || !(await readEnabled())) return;
    const permission = await Notifications.getPermissionsAsync();
    setStatus(permission.granted ? 'on' : 'blocked');
  }, []);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  return { status, scheduledCount, enable, disable, recheck, openSettings };
}

export type ReminderControls = ReturnType<typeof useReminders>;
