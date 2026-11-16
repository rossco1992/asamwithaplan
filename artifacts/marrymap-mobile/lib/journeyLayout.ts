/**
 * Geometry for the journey map: a single winding road that starts at
 * "Engaged" at the bottom of the screen and climbs to the wedding day at the
 * top. Kept free of React so it is easy to reason about and test.
 */

import type { JourneyNode, JourneyPhase, PhaseKey } from '@/lib/journey';

export type MapStopKind = 'start' | 'milestone' | 'finish';

export interface MapStop {
  key: string;
  kind: MapStopKind;
  node?: JourneyNode;
  x: number;
  y: number;
  /** Which side of the road the label sits on. */
  labelSide: 'left' | 'right';
}

export interface PhaseBanner {
  key: PhaseKey;
  label: string;
  y: number;
}

export interface MapLayout {
  width: number;
  height: number;
  stops: MapStop[];
  banners: PhaseBanner[];
  /** Path through every stop, bottom to top. */
  roadPath: string;
  /** Path from the start up to the current stop: the part already travelled. */
  travelledPath: string;
}

const STOP_SPACING = 118;
const BANNER_SPACE = 64;
const TOP_PADDING = 120;
const BOTTOM_PADDING = 132;
const WAVE = 1.05;

export function buildMapLayout(
  nodes: JourneyNode[],
  phases: JourneyPhase[],
  width: number,
): MapLayout {
  const phaseOf = new Map<number, JourneyPhase>();
  for (const phase of phases) {
    for (const id of phase.milestoneIds) phaseOf.set(id, phase);
  }

  // Distance climbed from the start, before the overall height is known.
  const climbs: number[] = [0];
  const bannerClimbs: { phase: JourneyPhase; climb: number }[] = [];
  let climb = 0;
  let lastPhase: PhaseKey | null = null;

  nodes.forEach((node) => {
    climb += STOP_SPACING;
    const phase = phaseOf.get(node.id);
    if (phase && phase.key !== lastPhase) {
      // The phase sign sits centred in the extra gap below its first stop.
      bannerClimbs.push({ phase, climb: climb - STOP_SPACING + (STOP_SPACING + BANNER_SPACE) / 2 });
      climb += BANNER_SPACE;
      lastPhase = phase.key;
    }
    climbs.push(climb);
  });
  climb += STOP_SPACING + 12;
  climbs.push(climb);

  const height = climb + TOP_PADDING + BOTTOM_PADDING;
  const centre = width / 2;
  const amplitude = Math.min(width * 0.27, 120);
  const yFor = (value: number) => height - BOTTOM_PADDING - value;

  const stops: MapStop[] = climbs.map((value, index) => {
    const isStart = index === 0;
    const isFinish = index === climbs.length - 1;
    // Start and finish sit on the centre line; the road weaves between them.
    const x = isStart || isFinish ? centre : centre + amplitude * Math.sin(index * WAVE);
    const node = isStart || isFinish ? undefined : nodes[index - 1];
    return {
      key: isStart ? 'start' : isFinish ? 'finish' : `m-${node!.id}`,
      kind: isStart ? 'start' : isFinish ? 'finish' : 'milestone',
      node,
      x,
      y: yFor(value),
      labelSide: x > centre ? 'left' : 'right',
    };
  });

  const banners: PhaseBanner[] = bannerClimbs.map(({ phase, climb: value }) => ({
    key: phase.key,
    label: phase.label,
    y: yFor(value),
  }));

  const currentIndex = stops.findIndex((stop) => stop.node?.isCurrent);
  const travelledUpTo = currentIndex === -1 ? (allDone(nodes) ? stops.length - 1 : 0) : currentIndex;

  return {
    width,
    height,
    stops,
    banners,
    roadPath: pathThrough(stops),
    travelledPath: travelledUpTo > 0 ? pathThrough(stops.slice(0, travelledUpTo + 1)) : '',
  };
}

function allDone(nodes: JourneyNode[]): boolean {
  return nodes.length > 0 && nodes.every((node) => node.status !== 'todo');
}

/** Smooth S-curves between consecutive stops. */
function pathThrough(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  let d = `M ${round(first!.x)} ${round(first!.y)}`;
  let previous = first!;
  for (const point of rest) {
    const rise = (previous.y - point.y) / 2;
    d += ` C ${round(previous.x)} ${round(previous.y - rise)}, ${round(point.x)} ${round(
      point.y + rise,
    )}, ${round(point.x)} ${round(point.y)}`;
    previous = point;
  }
  return d;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
