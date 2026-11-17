import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, type LayoutChangeEvent } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import { buildMapLayout, type MapStop } from '@/lib/journeyLayout';
import { formatDate, type Journey, type JourneyNode, type PhaseKey } from '@/lib/journey';
import { MapNode, NodeLabel, CURRENT_SIZE, NODE_SIZE } from '@/components/journey/MapNode';

interface Props {
  journey: Journey;
  initials: string;
  onOpenMilestone: (node: JourneyNode) => void;
  onAddNear: (phase: PhaseKey) => void;
}

const LANDMARK_SIZE = 76;

export function JourneyMap({ journey, initials, onOpenMilestone, onAddNear }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const centred = useRef(false);

  const layout = useMemo(
    () => (width > 0 ? buildMapLayout(journey.nodes, journey.phases, width) : null),
    [journey.nodes, journey.phases, width],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
    setViewportHeight(event.nativeEvent.layout.height);
  }, []);

  // Open centred on today: the current stop, or the start for a fresh journey.
  const centreOnCurrent = useCallback(() => {
    if (!layout || centred.current || viewportHeight === 0) return;
    const target =
      layout.stops.find((stop) => stop.node?.isCurrent) ??
      (journey.progress.done === journey.progress.total ? layout.stops.at(-1) : layout.stops[0]);
    if (!target) return;
    centred.current = true;
    const y = Math.max(0, Math.min(layout.height - viewportHeight, target.y - viewportHeight / 2));
    scrollRef.current?.scrollTo({ y, animated: false });
  }, [layout, viewportHeight, journey.progress]);

  const labelWidth = width > 0 ? width / 2 - 52 : 0;

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {layout ? (
        <ScrollView
          ref={scrollRef}
          onContentSizeChange={centreOnCurrent}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ height: layout.height, paddingBottom: insets.bottom }}
          accessibilityLabel="Your journey to the wedding day"
        >
          <Svg width={layout.width} height={layout.height} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="travelled" x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor={colors.primary} />
                <Stop offset="1" stopColor={colors.accent} />
              </LinearGradient>
            </Defs>
            {/* The road ahead: a soft verge with dashes down the middle. */}
            <Path d={layout.roadPath} stroke={colors.secondary} strokeWidth={22} strokeLinecap="round" fill="none" />
            <Path
              d={layout.roadPath}
              stroke={colors.border}
              strokeWidth={3}
              strokeDasharray="2 12"
              strokeLinecap="round"
              fill="none"
            />
            {layout.travelledPath ? (
              <Path
                d={layout.travelledPath}
                stroke="url(#travelled)"
                strokeWidth={8}
                strokeLinecap="round"
                fill="none"
              />
            ) : null}
          </Svg>

          {layout.banners.map((banner) => (
            <View
              key={banner.key}
              accessibilityRole="header"
              style={[styles.banner, { top: banner.y - 14 }]}
            >
              <View style={[styles.bannerRule, { backgroundColor: colors.border }]} />
              <View style={[styles.bannerPill, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.bannerText, { color: colors.accent }]} maxFontSizeMultiplier={1.4}>
                  {banner.label}
                </Text>
              </View>
              <View style={[styles.bannerRule, { backgroundColor: colors.border }]} />
            </View>
          ))}

          {layout.stops.map((stop) => (
            <MapStopView key={stop.key} stop={stop} labelWidth={labelWidth} weddingDate={journey.weddingDate}>
              {stop.node ? (
                <MapNode
                  node={stop.node}
                  initials={initials}
                  onPress={() => onOpenMilestone(stop.node!)}
                  onLongPress={() => onAddNear(stop.node!.phase)}
                />
              ) : null}
            </MapStopView>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** Positions one stop and its label on the map. */
function MapStopView({
  stop,
  labelWidth,
  weddingDate,
  children,
}: {
  stop: MapStop;
  labelWidth: number;
  weddingDate: string | null;
  children?: React.ReactNode;
}) {
  const colors = useColors();

  if (stop.kind !== 'milestone') {
    const isFinish = stop.kind === 'finish';
    return (
      <View
        accessible
        accessibilityLabel={
          isFinish
            ? `Wedding day${weddingDate ? `, ${formatDate(weddingDate, { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}`
            : 'Engaged, where your journey started'
        }
        style={[styles.landmarkWrap, { left: stop.x - 80, top: stop.y - LANDMARK_SIZE / 2 }]}
      >
        <View
          style={[
            styles.landmark,
            {
              backgroundColor: isFinish ? colors.accent : colors.primary,
              borderColor: colors.background,
            },
          ]}
        >
          <Ionicons name={isFinish ? 'heart' : 'diamond-outline'} size={30} color={colors.primaryForeground} />
        </View>
        <Text style={[styles.landmarkTitle, { color: colors.primary }]} maxFontSizeMultiplier={1.4}>
          {isFinish ? 'Wedding day' : 'Engaged'}
        </Text>
        {isFinish && weddingDate ? (
          <Text style={[styles.landmarkDate, { color: colors.mutedForeground }]} maxFontSizeMultiplier={1.4}>
            {formatDate(weddingDate, { month: 'long', day: 'numeric', year: 'numeric' })}
          </Text>
        ) : null}
      </View>
    );
  }

  const size = stop.node?.isCurrent ? CURRENT_SIZE : NODE_SIZE;
  const gap = 14;
  return (
    <>
      <View style={[styles.nodeWrap, { left: stop.x - size / 2, top: stop.y - size / 2 }]}>{children}</View>
      {stop.node ? (
        <View
          pointerEvents="none"
          style={[
            styles.labelWrap,
            stop.labelSide === 'right'
              ? { left: stop.x + size / 2 + gap }
              : { right: undefined, left: stop.x - size / 2 - gap - labelWidth, alignItems: 'flex-end' },
            { top: stop.y - 20, width: labelWidth },
          ]}
        >
          <NodeLabel node={stop.node} side={stop.labelSide} maxWidth={labelWidth} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  banner: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bannerRule: { flex: 1, height: StyleSheet.hairlineWidth },
  bannerPill: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  bannerText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  nodeWrap: { position: 'absolute' },
  labelWrap: { position: 'absolute' },
  landmarkWrap: { position: 'absolute', width: 160, alignItems: 'center' },
  landmark: {
    width: LANDMARK_SIZE,
    height: LANDMARK_SIZE,
    borderRadius: LANDMARK_SIZE / 2,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#192034',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  landmarkTitle: { fontFamily: fonts.serifBold, fontSize: 18, marginTop: 8 },
  landmarkDate: { fontFamily: fonts.sans, fontSize: 13, marginTop: 2 },
});
