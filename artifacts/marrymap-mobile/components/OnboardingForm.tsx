import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import { useApi } from '@/hooks/useApi';
import * as Haptics from 'expo-haptics';

type WeddingStyle = 'intimate' | 'standard' | 'large';

const styleOptions: { value: WeddingStyle; label: string; desc: string }[] = [
  { value: 'intimate', label: 'Intimate', desc: 'Under 50 guests' },
  { value: 'standard', label: 'Standard', desc: '50–150 guests' },
  { value: 'large', label: 'Large affair', desc: '150+ guests' },
];

interface Props {
  onSubmit: (weddingId: number) => void;
}

export function OnboardingForm({ onSubmit }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { apiFetch } = useApi();

  const [weddingDate, setWeddingDate] = useState('');
  const [city, setCity] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [style, setStyle] = useState<WeddingStyle>('standard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!weddingDate && !!city && !!guestCount && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    Haptics.selectionAsync();
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<{ weddingId: number; status: string }>('/timelines/generate', {
        method: 'POST',
        body: JSON.stringify({
          weddingDate,
          city,
          guestCount: parseInt(guestCount, 10),
          style,
        }),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSubmit(result.data.weddingId);
    } finally {
      setLoading(false);
    }
  };

  const s = useMemo(() => makeStyles(colors, insets), [colors, insets]);

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.eyebrow}>Let's get started</Text>
      <Text style={s.heading}>Tell Sam about{'\n'}your wedding.</Text>
      <Text style={s.subheading}>
        A few details is all she needs to build your complete week-by-week plan.
      </Text>

      {/* Wedding date */}
      <Text style={s.label}>Wedding date</Text>
      <TextInput
        style={s.input}
        value={weddingDate}
        onChangeText={setWeddingDate}
        placeholder="YYYY-MM-DD  e.g. 2026-09-12"
        placeholderTextColor={colors.mutedForeground}
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
        testID="date-input"
      />

      {/* City */}
      <Text style={s.label}>City or region</Text>
      <TextInput
        style={s.input}
        value={city}
        onChangeText={setCity}
        placeholder="e.g. London, UK"
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="words"
        testID="city-input"
      />

      {/* Guest count */}
      <Text style={s.label}>Estimated guest count</Text>
      <TextInput
        style={s.input}
        value={guestCount}
        onChangeText={setGuestCount}
        placeholder="e.g. 80"
        placeholderTextColor={colors.mutedForeground}
        keyboardType="number-pad"
        testID="guests-input"
      />

      {/* Style selector */}
      <Text style={s.label}>Wedding style</Text>
      <View style={s.styleRow}>
        {styleOptions.map((opt) => {
          const active = style === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={({ pressed }) => [
                s.styleBtn,
                active && s.styleBtnActive,
                pressed && s.buttonPressed,
              ]}
              onPress={() => { Haptics.selectionAsync(); setStyle(opt.value); }}
              testID={`style-${opt.value}`}
            >
              <Text style={[s.styleBtnLabel, active && s.styleBtnLabelActive]}>{opt.label}</Text>
              <Text style={[s.styleBtnDesc, active && s.styleBtnDescActive]}>{opt.desc}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Error */}
      {error && (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {/* Submit */}
      <Pressable
        style={({ pressed }) => [s.submitBtn, !canSubmit && s.btnDisabled, pressed && s.buttonPressed]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        testID="submit-btn"
      >
        {loading
          ? <ActivityIndicator color={colors.primaryForeground} />
          : <Text style={s.submitBtnText}>Build my timeline →</Text>
        }
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) {
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingTop: 28,
      paddingBottom: bottomPad + 40,
      paddingHorizontal: 20,
    },
    eyebrow: {
      fontFamily: fonts.sansSemiBold,
      fontSize: 11,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: colors.accent,
      marginBottom: 10,
    },
    heading: {
      fontFamily: fonts.serifBold,
      fontSize: 34,
      color: colors.primary,
      marginBottom: 10,
      letterSpacing: -0.5,
      lineHeight: 42,
    },
    subheading: {
      fontFamily: fonts.sans,
      fontSize: 15,
      color: colors.mutedForeground,
      marginBottom: 32,
      lineHeight: 22,
    },
    label: {
      fontFamily: fonts.sansSemiBold,
      fontSize: 13,
      color: colors.primary,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 13,
      fontSize: 15,
      fontFamily: fonts.sans,
      color: colors.foreground,
      backgroundColor: colors.card,
      marginBottom: 20,
    },
    styleRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
    styleBtn: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      backgroundColor: colors.card,
    },
    styleBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    styleBtnLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      color: colors.primary,
      marginBottom: 2,
    },
    styleBtnLabelActive: { color: colors.primaryForeground },
    styleBtnDesc: {
      fontFamily: fonts.sans,
      fontSize: 11,
      color: colors.mutedForeground,
    },
    styleBtnDescActive: { color: `${colors.primaryForeground}99` },
    errorBox: {
      backgroundColor: '#fef2f2',
      borderWidth: 1,
      borderColor: '#fecaca',
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
    },
    errorText: { fontFamily: fonts.sans, fontSize: 13, color: '#dc2626' },
    submitBtn: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
    },
    submitBtnText: {
      fontFamily: fonts.sansSemiBold,
      fontSize: 15,
      color: colors.primaryForeground,
    },
    btnDisabled: { opacity: 0.45 },
    buttonPressed: { opacity: 0.8 },
  });
}
