import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import { useApi } from '@/hooks/useApi';

interface Props {
  onJoined: (weddingId: number) => void;
  onBack: () => void;
}

/** The second partner joins the plan with the code the first one shared. */
export function JoinPlanForm({ onJoined, onBack }: Props) {
  const colors = useColors();
  const { apiFetch } = useApi();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleaned = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const canJoin = cleaned.length === 8 && !busy;

  const join = async () => {
    if (!canJoin) return;
    setBusy(true);
    setError(null);
    const result = await apiFetch<{ weddingId: number }>('/invites/accept', {
      method: 'POST',
      body: JSON.stringify({ code: cleaned }),
    });
    setBusy(false);
    if (!result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onJoined(result.data.weddingId);
  };

  // Show the code as ABCD-EFGH however it was typed or pasted.
  const display = cleaned.length > 4 ? `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}` : cleaned;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Pressable onPress={onBack} accessibilityRole="button" hitSlop={10} style={styles.back}>
        <Ionicons name="chevron-back" size={20} color={colors.accent} />
        <Text style={[styles.backText, { color: colors.accent }]}>Start our own plan</Text>
      </Pressable>

      <Text style={[styles.eyebrow, { color: colors.accent }]}>Planning together</Text>
      <Text style={[styles.heading, { color: colors.primary }]}>Join your{'\n'}partner's plan.</Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Enter the code they shared from the app. You'll see the same journey and can work on it together.
      </Text>

      <TextInput
        value={display}
        onChangeText={setCode}
        placeholder="ABCD-EFGH"
        placeholderTextColor={colors.border}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        maxLength={11}
        returnKeyType="go"
        onSubmitEditing={join}
        accessibilityLabel="Invite code"
        style={[styles.code, { color: colors.primary, borderColor: colors.border, backgroundColor: colors.card }]}
        testID="invite-code-input"
      />

      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.destructive} />
          <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={join}
        disabled={!canJoin}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canJoin }}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primary },
          !canJoin && { opacity: 0.45 },
          pressed && { opacity: 0.8 },
        ]}
        testID="join-btn"
      >
        {busy ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Join the plan</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 24 },
  backText: { fontFamily: fonts.sansMedium, fontSize: 15 },
  eyebrow: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  heading: { fontFamily: fonts.serifBold, fontSize: 34, lineHeight: 42, letterSpacing: -0.5, marginBottom: 10 },
  sub: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, marginBottom: 28 },
  code: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 28,
    letterSpacing: 4,
    textAlign: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 16,
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  error: { fontFamily: fonts.sans, fontSize: 14, flex: 1 },
  button: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: fonts.sansSemiBold, fontSize: 16 },
});
