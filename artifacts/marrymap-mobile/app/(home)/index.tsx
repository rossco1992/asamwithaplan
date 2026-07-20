import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useClerk, useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import { useApi } from '@/hooks/useApi';
import { OnboardingForm } from '@/components/OnboardingForm';
import { GeneratingState } from '@/components/GeneratingState';
import { TimelineView } from '@/components/TimelineView';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

const WEDDING_ID_KEY = 'sam_wedding_id';

export interface TimelineTask { title: string; priority: 'urgent' | 'this-week' | 'upcoming'; }
export interface TimelineWeek { weekLabel: string; phase: string; tasks: TimelineTask[]; }
export interface TimelineData { id: number; weddingId: number; generatedAt: string; tasks: TimelineWeek[]; }
export interface WeddingData { id: number; weddingDate: string; city: string; guestCount: number; style: string; }

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'form' }
  | { kind: 'generating'; weddingId: number }
  | { kind: 'ready'; timeline: TimelineData; wedding: WeddingData };

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useClerk();
  const { user } = useUser();
  const router = useRouter();
  const { apiFetch } = useApi();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });

  // Provision the DB user and load any existing wedding/timeline
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // JIT-provision DB user
      apiFetch('/users/me', { method: 'POST' }).catch(() => {});

      const storedId = await AsyncStorage.getItem(WEDDING_ID_KEY);
      if (!storedId || cancelled) {
        if (!cancelled) setState({ kind: 'form' });
        return;
      }
      const weddingId = parseInt(storedId, 10);
      if (isNaN(weddingId)) {
        if (!cancelled) setState({ kind: 'form' });
        return;
      }
      const result = await apiFetch<{ status: string; timeline?: TimelineData; wedding?: WeddingData }>(
        `/timelines/${weddingId}`
      );
      if (cancelled) return;
      if (!result.ok) { setState({ kind: 'form' }); return; }
      if (result.data.status === 'ready' && result.data.timeline && result.data.wedding) {
        setState({ kind: 'ready', timeline: result.data.timeline, wedding: result.data.wedding });
      } else {
        setState({ kind: 'generating', weddingId });
      }
    };

    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll when generating
  useEffect(() => {
    if (state.kind !== 'generating') return;
    const { weddingId } = state;
    const interval = setInterval(async () => {
      const result = await apiFetch<{ status: string; timeline?: TimelineData; wedding?: WeddingData }>(
        `/timelines/${weddingId}`
      );
      if (!result.ok) return;
      if (result.data.status === 'ready' && result.data.timeline && result.data.wedding) {
        setState({ kind: 'ready', timeline: result.data.timeline, wedding: result.data.wedding });
      }
    }, 3000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const handleFormSubmit = useCallback((weddingId: number) => {
    AsyncStorage.setItem(WEDDING_ID_KEY, String(weddingId));
    setState({ kind: 'generating', weddingId });
  }, []);

  const handleSignOut = useCallback(async () => {
    Haptics.selectionAsync();
    await AsyncStorage.removeItem(WEDDING_ID_KEY);
    await signOut();
    router.replace('/(auth)/sign-in');
  }, [signOut, router]);

  const s = useMemo(() => makeStyles(colors, insets), [colors, insets]);

  const displayName = user?.firstName ?? user?.primaryEmailAddress?.emailAddress?.split('@')[0];

  return (
    <View style={s.wrapper}>
      {/* Sticky nav bar */}
      <View style={s.navbar}>
        <Text style={s.navBrand}>A Sam with a plan.</Text>
        <View style={s.navRight}>
          {displayName ? (
            <Text style={s.navUser} numberOfLines={1}>{displayName}</Text>
          ) : null}
          <Pressable onPress={handleSignOut} style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="log-out-outline" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      {/* Content */}
      {state.kind === 'loading' && <GeneratingState />}
      {state.kind === 'form' && <OnboardingForm onSubmit={handleFormSubmit} />}
      {state.kind === 'generating' && <GeneratingState />}
      {state.kind === 'ready' && (
        <TimelineView timeline={state.timeline} wedding={state.wedding} />
      )}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) {
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  return StyleSheet.create({
    wrapper: { flex: 1, backgroundColor: colors.background },
    navbar: {
      paddingTop: topPad + 8,
      paddingBottom: 12,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    navBrand: {
      fontFamily: fonts.serifItalic,
      fontSize: 16,
      color: colors.accent,
      letterSpacing: 0.2,
    },
    navRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    navUser: {
      fontFamily: fonts.sans,
      fontSize: 13,
      color: colors.mutedForeground,
      maxWidth: 120,
    },
    iconBtn: { padding: 4 },
  });
}
