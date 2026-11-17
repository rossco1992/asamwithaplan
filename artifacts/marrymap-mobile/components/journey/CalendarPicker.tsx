import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import { parseIsoDate, toIsoDate } from '@/lib/journey';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface Props {
  value: string | null;
  /** The month shown first when nothing is picked yet. */
  initialMonth: string;
  /** Marked on the grid so the couple can see it while choosing. */
  weddingDate: string | null;
  onChange: (date: string) => void;
}

/** A compact month grid, so picking a date needs no extra native module. */
export function CalendarPicker({ value, initialMonth, weddingDate, onChange }: Props) {
  const colors = useColors();
  const start = parseIsoDate(value ?? initialMonth);
  const [year, setYear] = useState(start.getFullYear());
  const [month, setMonth] = useState(start.getMonth());

  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const list: (number | null)[] = Array(firstWeekday).fill(null);
    for (let day = 1; day <= days; day += 1) list.push(day);
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [year, month]);

  const shift = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  const title = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <View style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Pressable onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.primary }]} accessibilityRole="header">
          {title}
        </Text>
        <Pressable onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel="Next month" hitSlop={10}>
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {WEEKDAYS.map((day, index) => (
          <Text key={index} style={[styles.weekday, { color: colors.mutedForeground }]} importantForAccessibility="no">
            {day}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (day === null) return <View key={index} style={styles.cell} />;
          const iso = toIsoDate(year, month, day);
          const selected = iso === value;
          const isWedding = iso === weddingDate;
          return (
            <Pressable
              key={index}
              onPress={() => onChange(iso)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${parseIsoDate(iso).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}${isWedding ? ', your wedding day' : ''}`}
              style={styles.cell}
            >
              <View
                style={[
                  styles.day,
                  selected && { backgroundColor: colors.primary },
                  !selected && isWedding && { borderWidth: 1.5, borderColor: colors.accent },
                ]}
              >
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[styles.dayText, { color: selected ? colors.primaryForeground : colors.foreground }]}
                >
                  {day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 14, borderWidth: 1, padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  title: { fontFamily: fonts.sansSemiBold, fontSize: 16 },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontFamily: fonts.sansMedium, fontSize: 12, paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontFamily: fonts.sans, fontSize: 15 },
});
