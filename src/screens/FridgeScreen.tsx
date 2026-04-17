import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, Animated, PanResponder,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useFridgeStore } from '../store/fridgeStore';
import { daysLeft, getExpiryStyle, getBubbleSize, dayLabel, urgency } from '../lib/expiry';
import { FridgeItem } from '../types';

const { width: SCREEN_W } = Dimensions.get('window');
const CANVAS_W = SCREEN_W - 32;
const CANVAS_H = 290;

type ZoneBounds = { x: number; y: number; w: number; h: number };

const hitZone = (mx: number, my: number, z: ZoneBounds) =>
  z.w > 0 && mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h;

// ─── Bubble ──────────────────────────────────────────────────────────────────

function Bubble({
  item, onUsed, onTrashed,
  trashZone, usedZone,
  onDragMove, onDragEnd,
}: {
  item: FridgeItem;
  onUsed: (id: string) => void;
  onTrashed: (id: string) => void;
  trashZone: React.MutableRefObject<ZoneBounds>;
  usedZone: React.MutableRefObject<ZoneBounds>;
  onDragMove: (overTrash: boolean, overUsed: boolean) => void;
  onDragEnd: () => void;
}) {
  const days = daysLeft(item.expiry_date);
  const style = getExpiryStyle(days);
  const size = getBubbleSize(days);
  const pan = useRef(new Animated.ValueXY()).current;
  const [isDragging, setIsDragging] = useState(false);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => setIsDragging(true),
    onPanResponderMove: (_, g) => {
      pan.setValue({ x: g.dx, y: g.dy });
      onDragMove(hitZone(g.moveX, g.moveY, trashZone.current), hitZone(g.moveX, g.moveY, usedZone.current));
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
          elevation: isDragging ? 10 : 2,
        },
        { transform: pan.getTranslateTransform() },
      ]}
    >
      <Text style={styles.bubbleIcon}>{item.icon}</Text>
      <Text style={[styles.bubbleName, { color: style.text }]} numberOfLines={1}>{item.name}</Text>
      <Text style={[styles.bubbleDays, { color: style.text }]}>{dayLabel(days)}</Text>
    </Animated.View>
  );
}

// ─── FridgeScreen ─────────────────────────────────────────────────────────────

export default function FridgeScreen({ navigation }: any) {
  const { items, fetchItems, setStatus } = useFridgeStore();

  // Re-fetch on focus — fixes post-scan and post-add-item refresh
  useFocusEffect(useCallback(() => { fetchItems(); }, []));

  const activeItems = items.filter(i => i.status === 'active');
  const expiringCount = activeItems.filter(i => daysLeft(i.expiry_date) <= 2).length;

  // Drop zone refs — measured with measure() for reliable screen coordinates
  const trashRef = useRef<View>(null);
  const usedRef  = useRef<View>(null);
  const trashZone = useRef<ZoneBounds>({ x: 0, y: 0, w: 0, h: 0 });
  const usedZone  = useRef<ZoneBounds>({ x: 0, y: 0, w: 0, h: 0 });

  // Highlight animations driven by drag position
  const trashAnim = useRef(new Animated.Value(0)).current;
  const usedAnim  = useRef(new Animated.Value(0)).current;

  const handleDragMove = (overTrash: boolean, overUsed: boolean) => {
    trashAnim.setValue(overTrash ? 1 : 0);
    usedAnim.setValue(overUsed ? 1 : 0);
  };
  const handleDragEnd = () => {
    trashAnim.setValue(0);
    usedAnim.setValue(0);
  };

  const trashBg    = trashAnim.interpolate({ inputRange: [0, 1], outputRange: ['#FFF0F0', '#FFBDBD'] });
  const trashScale = trashAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  const usedBg     = usedAnim.interpolate({ inputRange: [0, 1], outputRange: ['#F0FDF9', '#A8EFD4'] });
  const usedScale  = usedAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>My Fridge</Text>
        {expiringCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{expiringCount} expiring soon</Text>
          </View>
        )}
      </View>

      {/* Colour legend */}
      <View style={styles.legend}>
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

      {/* Bubble canvas — overflow:visible so bubbles can drag outside bounds */}
      <View style={styles.canvas}>
        {activeItems.length === 0 ? (
          <Text style={styles.emptyText}>Your fridge is empty 🎉{'\n'}Add something!</Text>
        ) : (
          activeItems.map((item, i) => {
            const angle = (i / activeItems.length) * Math.PI * 2 - Math.PI / 2;
            const u     = urgency(daysLeft(item.expiry_date));
            const maxR  = Math.min(CANVAS_W, CANVAS_H) * 0.36;
            const r     = maxR * (1 - u * 0.7);
            const size  = getBubbleSize(daysLeft(item.expiry_date));
            const x     = CANVAS_W / 2 + Math.cos(angle) * r - size / 2;
            const y     = CANVAS_H / 2 + Math.sin(angle) * r - size / 2;

            return (
              <View key={item.id} style={{ position: 'absolute', left: x, top: y }}>
                <Bubble
                  item={item}
                  onUsed={(id) => setStatus(id, 'used')}
                  onTrashed={(id) => setStatus(id, 'trashed')}
                  trashZone={trashZone}
                  usedZone={usedZone}
                  onDragMove={handleDragMove}
                  onDragEnd={handleDragEnd}
                />
              </View>
            );
          })
        )}
      </View>

      {/* Drop zones — clearly visible targets BELOW the canvas */}
      <View style={styles.dropRow}>
        {/* Trash zone */}
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

        {/* Used zone */}
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
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 64 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '600', color: '#111' },
  badge: { backgroundColor: '#FEF3C7', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, color: '#92400E', fontWeight: '500' },
  legend: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: '#888' },
  canvas: {
    width: CANVAS_W, height: CANVAS_H,
    backgroundColor: '#f8f8f8', borderRadius: 16,
    borderWidth: 0.5, borderColor: '#eee',
    overflow: 'visible',          // lets bubbles drag outside canvas into drop zones
    marginBottom: 10,
  },
  bubble: {
    position: 'absolute', borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', padding: 4,
  },
  bubbleIcon: { fontSize: 20 },
  bubbleName: { fontSize: 9, fontWeight: '500', textAlign: 'center', maxWidth: '90%' },
  bubbleDays: { fontSize: 8, opacity: 0.85 },
  emptyText: { textAlign: 'center', marginTop: 100, color: '#aaa', fontSize: 15, lineHeight: 24 },
  dropRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  dropTarget: {
    height: 80, borderRadius: 14,
    overflow: 'hidden',           // clips Animated.View scale so it stays within bounds
  },
  dropInner: {
    borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
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
});
