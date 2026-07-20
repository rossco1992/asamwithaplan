import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';

const DOTS = ['.', '..', '...'];

function SkeletonCard() {
  const colors = useColors();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View style={[skeletonStyles.card, { borderColor: colors.border, opacity: pulse }]}>
      <View style={[skeletonStyles.line, skeletonStyles.lineShort, { backgroundColor: colors.secondary }]} />
      <View style={[skeletonStyles.line, skeletonStyles.lineFull, { backgroundColor: colors.secondary }]} />
      <View style={[skeletonStyles.line, skeletonStyles.lineFull, { backgroundColor: colors.secondary }]} />
      <View style={[skeletonStyles.line, skeletonStyles.lineMid, { backgroundColor: colors.secondary }]} />
      <View style={[skeletonStyles.badge, { backgroundColor: colors.muted }]} />
    </Animated.View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  line: { height: 10, borderRadius: 5 },
  lineShort: { width: '40%' },
  lineFull: { width: '90%' },
  lineMid: { width: '65%' },
  badge: { height: 18, width: 70, borderRadius: 4 },
});

export function GeneratingState() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [dotIdx, setDotIdx] = React.useState(0);

  useEffect(() => {
    const t = setInterval(() => setDotIdx(d => (d + 1) % 3), 600);
    return () => clearInterval(t);
  }, []);

  const s = useMemo(() => makeStyles(colors, insets), [colors, insets]);

  return (
    <View style={s.container}>
      <Text style={s.eyebrow}>Building your plan</Text>
      <Text style={s.heading}>Sam is on it{DOTS[dotIdx]}</Text>
      <Text style={s.subheading}>
        She's reviewing your details and mapping out every task, week by week.{'\n'}
        This usually takes under 30 seconds.
      </Text>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) {
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 28,
      paddingBottom: bottomPad + 24,
      backgroundColor: colors.background,
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
    },
    subheading: {
      fontFamily: fonts.sans,
      fontSize: 14,
      color: colors.mutedForeground,
      marginBottom: 32,
      lineHeight: 21,
    },
  });
}
