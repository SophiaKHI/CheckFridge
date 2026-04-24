import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, Animated, PanResponder, Image, Easing,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useFridgeStore } from '../store/fridgeStore';
import { daysLeft, getExpiryStyle, dayLabel, urgency } from '../lib/expiry';
import { FridgeItem } from '../types';

const { width: SCREEN_W } = Dimensions.get('window');
const CANVAS_W = SCREEN_W - 32;

// Iggo assets — static requires must be at module level
const IGGO_NEUTRAL = require('../../assets/neutural.png');
const IGGO_HAPPY = [
  require('../../assets/happy1.png'),
  require('../../assets/happy2.png'),
  require('../../assets/happy3.png'),
  require('../../assets/happy4.png'),
];
const IGGO_SAD = [
  require('../../assets/sad1.png'),
  require('../../assets/sad2.png'),
  require('../../assets/sad3.png'),
  require('../../assets/sad4.png'),
];

// ─── Bubble layout ────────────────────────────────────────────────────────────

const BUBBLE_PAD    = 6;
const BUBBLE_BASE   = 75;
const BUBBLE_VAR    = 4;   // ±2px from base — nearly uniform sizes
const CANVAS_MARGIN = 6;   // keeps bubbles inset from edge so float animation never clips

// Iggo is now fully ABOVE the canvas (in iggoRow), so no exclusion zone needed.

function computeBubbleLayout(
  items: FridgeItem[],
  canvasW: number,
  canvasH: number,
): Array<{ item: FridgeItem; x: number; y: number; size: number }> {
  if (items.length === 0 || canvasW < 10 || canvasH < 10) return [];

  // 1. Near-uniform sizes — 75px base, ±5px nudge from urgency (max 10px spread)
  const sizes = items.map(item => {
    const u = urgency(daysLeft(item.expiry_date));
    return Math.round(BUBBLE_BASE + (1 - u) * BUBBLE_VAR);
    // fresh (u=0) → 85px, expired (u=1) → 75px
  });

  // 2. Elliptical initial placement — uses full canvas width AND height
  //    so fresh (low urgency) items spread to ALL edges, not just a narrow circle
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const maxRx = canvasW * 0.44;  // horizontal radius — uses full width
  const maxRy = canvasH * 0.44;  // vertical radius — uses full height

  const circles = items.map((item, i) => {
    const u = urgency(daysLeft(item.expiry_date));
    const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2;
    const scale = 1 - u * 0.65; // u=0 fresh → outer ellipse; u=1 expired → center
    return {
      item,
      size: sizes[i],
      x: cx + Math.cos(angle) * maxRx * scale,
      y: cy + Math.sin(angle) * maxRy * scale,
    };
  });

  // 3. Iterative collision resolution — push overlapping pairs apart
  for (let iter = 0; iter < 250; iter++) {
    let moved = false;
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const dx = circles[j].x - circles[i].x;
        const dy = circles[j].y - circles[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const minDist = circles[i].size / 2 + circles[j].size / 2 + BUBBLE_PAD;
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist; const ny = dy / dist;
          circles[i].x -= nx * push; circles[i].y -= ny * push;
          circles[j].x += nx * push; circles[j].y += ny * push;
          moved = true;
        }
      }
      // Clamp inside canvas bounds (inset by CANVAS_MARGIN so float animation never clips)
      const r = circles[i].size / 2;
      circles[i].x = Math.max(r + CANVAS_MARGIN, Math.min(canvasW - r - CANVAS_MARGIN, circles[i].x));
      circles[i].y = Math.max(r + CANVAS_MARGIN, Math.min(canvasH - r - CANVAS_MARGIN, circles[i].y));
    }
    if (!moved) break;
  }

  // Convert center coords → top-left for absolute positioning
  return circles.map(c => ({
    item: c.item, size: c.size,
    x: c.x - c.size / 2,
    y: c.y - c.size / 2,
  }));
}

type ZoneBounds = { x: number; y: number; w: number; h: number };

const hitZone = (mx: number, my: number, z: ZoneBounds) =>
  z.w > 0 && mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h;

// ─── Bubble ──────────────────────────────────────────────────────────────────

const FLOAT_AMPLITUDE = 4;   // px up/down
const FLOAT_PERIOD    = 3200; // ms per full cycle

function Bubble({
  item, size, floatPhase,
  onUsed, onTrashed,
  trashZone, usedZone,
  onDragMove, onDragEnd,
}: {
  item: FridgeItem;
  size: number;
  /** 0–1 phase offset so each bubble floats at a different point in the cycle */
  floatPhase: number;
  onUsed: (id: string) => void;
  onTrashed: (id: string) => void;
  trashZone: React.MutableRefObject<ZoneBounds>;
  usedZone: React.MutableRefObject<ZoneBounds>;
  onDragMove: (overTrash: boolean, overUsed: boolean) => void;
  onDragEnd: () => void;
}) {
  const days = daysLeft(item.expiry_date);
  const style = getExpiryStyle(days);
  const pan = useRef(new Animated.ValueXY()).current;
  const [isDragging, setIsDragging] = useState(false);

  // Gentle floating animation — each bubble starts at a different phase
  const floatAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: FLOAT_PERIOD / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: FLOAT_PERIOD / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );
    const delay = Math.round(floatPhase * FLOAT_PERIOD);
    const timer = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(timer); loop.stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const floatY = floatAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [FLOAT_AMPLITUDE, -FLOAT_AMPLITUDE],
  });

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => setIsDragging(true),
    onPanResponderMove: (_, g) => {
      pan.setValue({ x: g.dx, y: g.dy });
      onDragMove(
        hitZone(g.moveX, g.moveY, trashZone.current),
        hitZone(g.moveX, g.moveY, usedZone.current),
      );
    },
    onPanResponderRelease: (_, g) => {
      setIsDragging(false);
      onDragEnd();
      if (hitZone(g.moveX, g.moveY, trashZone.current)) { onTrashed(item.id); return; }
      if (hitZone(g.moveX, g.moveY, usedZone.current))  { onUsed(item.id);    return; }
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
    },
    onPanResponderTerminate: () => {
      setIsDragging(false);
      onDragEnd();
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
    },
  })).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.bubble,
        {
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: style.bg, borderColor: style.border,
          zIndex: isDragging ? 100 : 5,
          shadowOpacity: isDragging ? 0.22 : 0.1,
          elevation: isDragging ? 10 : 3,
        },
        {
          transform: [
            ...pan.getTranslateTransform(),
            // Float pauses while dragging so it doesn't fight the gesture
            ...(isDragging ? [] : [{ translateY: floatY }]),
          ],
        },
      ]}
    >
      {/* Glossy highlight — small white ellipse in upper-left */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size * 0.36, height: size * 0.2,
          borderRadius: size * 0.12,
          backgroundColor: 'rgba(255,255,255,0.48)',
          top: size * 0.11, left: size * 0.16,
          transform: [{ rotate: '-20deg' }],
        }}
      />
      <Text style={styles.bubbleIcon}>{item.icon}</Text>
      <Text style={[styles.bubbleName, { color: style.text }]} numberOfLines={1}>{item.name}</Text>
      <Text style={[styles.bubbleDays, { color: style.text }]}>{dayLabel(days)}</Text>
    </Animated.View>
  );
}

// ─── FridgeScreen ─────────────────────────────────────────────────────────────

type UndoToast = { item: FridgeItem; action: 'used' | 'trashed' } | null;

export default function FridgeScreen({ navigation }: any) {
  const { items, fetchItems, setStatus, restoreItem } = useFridgeStore();

  useFocusEffect(useCallback(() => { fetchItems(); }, []));

  // Stable reference — only recomputes when the store's items array changes
  const activeItems = useMemo(
    () => items.filter(i => i.status === 'active'),
    [items],
  );

  // Four categories matching the legend — expired <0, use today =0, expiring 1-3, use soon 4-6, fresh 7+
  const expiredCount   = useMemo(
    () => activeItems.filter(i => daysLeft(i.expiry_date) < 0).length,
    [activeItems],
  );
  const useTodayCount  = useMemo(
    () => activeItems.filter(i => daysLeft(i.expiry_date) === 0).length,
    [activeItems],
  );
  const expiringCount  = useMemo(
    () => activeItems.filter(i => { const d = daysLeft(i.expiry_date); return d >= 1 && d <= 3; }).length,
    [activeItems],
  );
  const useSoonCount   = useMemo(
    () => activeItems.filter(i => { const d = daysLeft(i.expiry_date); return d >= 4 && d <= 6; }).length,
    [activeItems],
  );

  // Resting scale: +1=happy1 (all fresh), 0=neutral (any 1-6d), -3=sad3 (any expired/today)
  const restingScale = useMemo(() => {
    if (expiredCount > 0 || useTodayCount > 0) return -3;
    if (expiringCount > 0 || useSoonCount > 0) return 0;
    return 1;
  }, [expiredCount, useTodayCount, expiringCount, useSoonCount]);

  // Debug: log per-item daysLeft and resting scale so mood issues are visible in Metro
  useEffect(() => {
    if (__DEV__) {
      console.log('[Iggo] days per item:',
        activeItems.map(i => `${i.name}=${daysLeft(i.expiry_date)}`).join(', ') || '(empty)',
      );
      console.log(
        `[Iggo] expired=${expiredCount} useToday=${useTodayCount} expiring=${expiringCount} useSoon=${useSoonCount}` +
        ` → restingScale=${restingScale}`,
      );
    }
  }, [activeItems, expiredCount, useTodayCount, expiringCount, useSoonCount, restingScale]);

  // Thought bubble — shows all urgent/non-fresh categories
  const thoughtBubble = useMemo(() => {
    if (activeItems.length === 0) return null;
    const parts: string[] = [];
    if (expiredCount  > 0) parts.push(`${expiredCount} expired 🔴`);
    if (useTodayCount > 0) parts.push(`${useTodayCount} use today 🔴`);
    if (expiringCount > 0) parts.push(`${expiringCount} expiring 🟠`);
    if (useSoonCount  > 0) parts.push(`${useSoonCount} use soon 🟡`);
    if (parts.length  > 0) {
      const color = (expiredCount > 0 || useTodayCount > 0) ? '#E57373' : expiringCount > 0 ? '#D85A30' : '#F59E0B';
      return { text: parts.join(' · '), color };
    }
    return { text: 'All fresh! 🟢', color: '#1D9E75' };
  }, [activeItems.length, expiredCount, useTodayCount, expiringCount, useSoonCount]);

  // Measured by onLayout so bubbles always fill the actual rendered canvas
  const [canvasDims, setCanvasDims] = useState({ w: CANVAS_W, h: 380 });
  const bubbleLayout = useMemo(
    () => computeBubbleLayout(activeItems, canvasDims.w, canvasDims.h),
    [activeItems, canvasDims],
  );

  // Animated positions — existing bubbles spring to new slots when layout changes
  const bubblePosMap = useRef<Map<string, Animated.ValueXY>>(new Map());
  useEffect(() => {
    const currentIds = new Set(bubbleLayout.map(b => b.item.id));
    // Remove stale entries
    for (const id of bubblePosMap.current.keys()) {
      if (!currentIds.has(id)) bubblePosMap.current.delete(id);
    }
    // Spring existing bubbles to their new target positions
    bubbleLayout.forEach(({ item, x, y }) => {
      const anim = bubblePosMap.current.get(item.id);
      if (anim) {
        Animated.spring(anim, {
          toValue: { x, y },
          useNativeDriver: false,
          tension: 55,
          friction: 11,
        }).start();
      }
      // New items are initialised at render time (see JSX loop)
    });
  }, [bubbleLayout]);

  // Drop zone refs
  const trashRef  = useRef<View>(null);
  const usedRef   = useRef<View>(null);
  const trashZone = useRef<ZoneBounds>({ x: 0, y: 0, w: 0, h: 0 });
  const usedZone  = useRef<ZoneBounds>({ x: 0, y: 0, w: 0, h: 0 });

  const trashAnim = useRef(new Animated.Value(0)).current;
  const usedAnim  = useRef(new Animated.Value(0)).current;

  const handleDragMove = (overTrash: boolean, overUsed: boolean) => {
    trashAnim.setValue(overTrash ? 1 : 0);
    usedAnim.setValue(overUsed ? 1 : 0);
  };
  const handleDragEnd = () => { trashAnim.setValue(0); usedAnim.setValue(0); };

  // Undo toast
  const [undoToast, setUndoToast] = useState<UndoToast>(null);
  const toastAnim    = useRef(new Animated.Value(0)).current;
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true })
      .start(() => setUndoToast(null));
  }, [toastAnim]);

  const showUndoToast = useCallback((item: FridgeItem, action: 'used' | 'trashed') => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast({ item, action });
    Animated.spring(toastAnim, { toValue: 1, useNativeDriver: true }).start();
    undoTimerRef.current = setTimeout(dismissToast, 5000);
  }, [toastAnim, dismissToast]);

  const handleUndo = useCallback(() => {
    if (!undoToast) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    restoreItem(undoToast.item);
    Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true })
      .start(() => setUndoToast(null));
  }, [undoToast, toastAnim, restoreItem]);

  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);

  // Mood scale: -4 (sad4) … -1 (sad1) … 0 (neutral) … +1 (happy1) … +4 (happy4)
  // Resting: +1, 0, -3. sad4 / happy4 only reachable through consecutive swipes.
  const [moodScale, setMoodScale] = useState(restingScale);
  const iggoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSwipingRef = useRef(false);

  // Snap to resting whenever fridge state changes and no swipe is in progress
  useEffect(() => {
    if (!isSwipingRef.current) setMoodScale(restingScale);
  }, [restingScale]);

  // Derive display vars from scale — JSX stays unchanged
  const iggoMood: 'neutral' | 'happy' | 'sad' =
    moodScale === 0 ? 'neutral' : moodScale > 0 ? 'happy' : 'sad';
  const iggoFrame = moodScale === 0 ? 0 : moodScale > 0 ? moodScale - 1 : -moodScale - 1;

  useEffect(() => {
    if (__DEV__) console.log(`[Iggo] scale=${moodScale} → ${iggoMood}${iggoFrame + 1}`);
  }, [moodScale]);

  // Swipe: move 1 step toward happy/sad from current position, hold 3 s, return to resting
  const playIggo = useCallback((direction: 'happy' | 'sad') => {
    if (iggoTimerRef.current) clearTimeout(iggoTimerRef.current);
    isSwipingRef.current = true;
    setMoodScale(prev => Math.max(-4, Math.min(4, direction === 'happy' ? prev + 1 : prev - 1)));
    iggoTimerRef.current = setTimeout(() => {
      isSwipingRef.current = false;
      setMoodScale(restingScale);
    }, 3000);
  }, [restingScale]);

  useEffect(() => () => { if (iggoTimerRef.current) clearTimeout(iggoTimerRef.current); }, []);

  // All frames pre-rendered to prevent size jumping — see iggoContainer style

  const handleUsed = useCallback((id: string) => {
    const item = items.find(i => i.id === id);
    setStatus(id, 'used');
    if (item) showUndoToast(item, 'used');
    playIggo('happy');
  }, [items, setStatus, showUndoToast, playIggo]);

  const handleTrashed = useCallback((id: string) => {
    const item = items.find(i => i.id === id);
    setStatus(id, 'trashed');
    if (item) showUndoToast(item, 'trashed');
    playIggo('sad');
  }, [items, setStatus, showUndoToast, playIggo]);

  const trashBg    = trashAnim.interpolate({ inputRange: [0, 1], outputRange: ['#FFF0F0', '#FFBDBD'] });
  const trashScale = trashAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  const usedBg     = usedAnim.interpolate({ inputRange: [0, 1], outputRange: ['#F0FDF9', '#A8EFD4'] });
  const usedScale  = usedAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>My Fridge</Text>
      </View>

      {/* Legend + Iggo row — legend dots and thought bubble on the left, Iggo on the right */}
      <View style={styles.legendRow}>
        {/* Left column: legend dots stacked above the thought bubble */}
        <View style={styles.legendLeft}>
          <View style={styles.legendDots}>
            {[
              { color: '#9FE1CB', label: 'Fresh' },
              { color: '#FAC775', label: 'Use soon' },
              { color: '#F5C4B3', label: 'Expiring' },
              { color: '#F7C1C1', label: 'Expired' },
            ].map(l => (
              <View key={l.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                <Text style={styles.legendLabel}>{l.label}</Text>
              </View>
            ))}
          </View>

          {/* Status badge — simple pill showing fridge state */}
          {thoughtBubble && (
            <View style={[styles.statusBadge, { borderColor: thoughtBubble.color }]}>
              <Text style={[styles.statusBadgeText, { color: thoughtBubble.color }]}>
                {thoughtBubble.text}
              </Text>
            </View>
          )}
        </View>

        {/* Iggo — flex child on the right; frames are position:absolute inside the container */}
        <View style={styles.iggoContainer}>
          <Image source={IGGO_NEUTRAL}
            style={[styles.iggo, { opacity: iggoMood === 'neutral' ? 1 : 0 }]}
            resizeMode="cover" fadeDuration={0} />
          {IGGO_HAPPY.map((src, i) => (
            <Image key={`h${i}`} source={src}
              style={[styles.iggo, { opacity: iggoMood === 'happy' && iggoFrame === i ? 1 : 0 }]}
              resizeMode="cover" fadeDuration={0} />
          ))}
          {IGGO_SAD.map((src, i) => (
            <Image key={`s${i}`} source={src}
              style={[styles.iggo, { opacity: iggoMood === 'sad' && iggoFrame === i ? 1 : 0 }]}
              resizeMode="cover" fadeDuration={0} />
          ))}
        </View>
      </View>

      {/* Canvas wrapper — no Iggo inside, so overflow:hidden is clean */}
      <View style={styles.canvasWrapper}>
        {/* Bubble canvas — snow globe effect */}
        <View
          style={styles.canvas}
          onLayout={e => {
            const { width, height } = e.nativeEvent.layout;
            setCanvasDims(d => d.w === width && d.h === height ? d : { w: width, h: height });
          }}
        >
          {bubbleLayout.length === 0 ? (
            <Text style={styles.emptyText}>Your fridge is empty 🎉{'\n'}Add something!</Text>
          ) : (
            bubbleLayout.map(({ item, x, y, size }, i) => {
              // Initialise position on first render; existing entries animate via useEffect
              if (!bubblePosMap.current.has(item.id)) {
                bubblePosMap.current.set(item.id, new Animated.ValueXY({ x, y }));
              }
              const pos = bubblePosMap.current.get(item.id)!;
              return (
                <Animated.View key={item.id} style={{ position: 'absolute', left: pos.x, top: pos.y }}>
                  <Bubble
                    item={item}
                    size={size}
                    floatPhase={i / bubbleLayout.length}
                    onUsed={handleUsed}
                    onTrashed={handleTrashed}
                    trashZone={trashZone}
                    usedZone={usedZone}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                  />
                </Animated.View>
              );
            })
          )}
        </View>
      </View>

      {/* Drop zones */}
      <View style={styles.dropRow}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('History', { initialStatus: 'trashed' })}
        >
          <View
            ref={trashRef}
            style={styles.dropTarget}
            onLayout={() =>
              trashRef.current?.measure((_, __, w, h, px, py) => {
                trashZone.current = { x: px, y: py, w, h };
              })
            }
          >
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.dropInner, { backgroundColor: trashBg, transform: [{ scale: trashScale }] }]}
            >
              <Text style={styles.dropIcon}>🗑️</Text>
              <Text style={styles.dropLabel}>Drag here to toss</Text>
            </Animated.View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('History', { initialStatus: 'used' })}
        >
          <View
            ref={usedRef}
            style={styles.dropTarget}
            onLayout={() =>
              usedRef.current?.measure((_, __, w, h, px, py) => {
                usedZone.current = { x: px, y: py, w, h };
              })
            }
          >
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.dropInner, { backgroundColor: usedBg, transform: [{ scale: usedScale }] }]}
            >
              <Text style={styles.dropIcon}>✅</Text>
              <Text style={styles.dropLabel}>Drag here — all used</Text>
            </Animated.View>
          </View>
        </TouchableOpacity>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('AddItem')}>
          <Text style={styles.actionBtnText}>+ Add item</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={() => navigation.navigate('ScanFridge')}
        >
          <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Scan fridge</Text>
        </TouchableOpacity>
      </View>

      {/* Undo toast */}
      {undoToast && (
        <Animated.View
          style={[
            styles.toast,
            {
              opacity: toastAnim,
              transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
            },
          ]}
        >
          <Text style={styles.toastText}>
            {undoToast.action === 'used' ? 'Marked as used ✅' : 'Thrown away 🗑️'}
          </Text>
          <TouchableOpacity onPress={handleUndo} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.toastUndo}>UNDO</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 56 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 0 },
  title: { fontSize: 22, fontWeight: '600', color: '#111' },
  // Combined legend + Iggo row
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  legendLeft: {
    flex: 1,
    gap: 4,
    paddingVertical: 0,
  },
  legendDots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: '#888' },
  canvasWrapper: {
    flex: 1,
    marginBottom: 10,
  },
  canvas: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
    borderWidth: 0.5, borderColor: '#eee',
    overflow: 'hidden',   // snow globe — bubbles clipped cleanly at canvas edge
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  statusBadgeText: { fontSize: 12, fontWeight: '600' },
  iggoContainer: {
    // Normal flex child in legendRow — frames are position:absolute inside
    width: 130, height: 130,
    marginRight: -16, // bleed to the right screen edge (matches container padding)
    flexShrink: 0,
    backgroundColor: 'transparent',
  },
  iggo: {
    position: 'absolute', // all 9 frames stack on top of each other
    width: 130, height: 130,
    backgroundColor: 'transparent',
  },
  bubble: {
    position: 'absolute', borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  bubbleIcon: { fontSize: 20 },
  bubbleName: { fontSize: 9, fontWeight: '500', textAlign: 'center', maxWidth: '90%' },
  bubbleDays: { fontSize: 8, opacity: 0.85 },
  emptyText: { textAlign: 'center', marginTop: 100, color: '#aaa', fontSize: 15, lineHeight: 24 },
  dropRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  dropTarget: { height: 80, borderRadius: 14, overflow: 'hidden' },
  dropInner: { borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dropIcon: { fontSize: 26 },
  dropLabel: { fontSize: 11, fontWeight: '500', color: '#888' },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1, backgroundColor: '#1D9E75', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  actionBtnSecondary: { backgroundColor: '#f0fdf9', borderWidth: 1, borderColor: '#1D9E75' },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  actionBtnTextSecondary: { color: '#1D9E75' },
  toast: {
    position: 'absolute', bottom: 90, left: 16, right: 16,
    backgroundColor: '#222', borderRadius: 12,
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 16, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  toastText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '500' },
  toastUndo: { color: '#4ADE80', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
});
