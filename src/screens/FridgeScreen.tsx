import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Animated, PanResponder,
} from 'react-native';
import { useFridgeStore } from '../store/fridgeStore';
import { daysLeft, getExpiryStyle, getBubbleSize, dayLabel, urgency } from '../lib/expiry';
import { FridgeItem } from '../types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CANVAS_W = SCREEN_W - 32;
const CANVAS_H = 340;

function Bubble({ item, onUsed, onTrashed }: {
  item: FridgeItem;
  onUsed: (id: string) => void;
  onTrashed: (id: string) => void;
}) {
  const days = daysLeft(item.expiry_date);
  const style = getExpiryStyle(days);
  const size = getBubbleSize(days);
  const u = urgency(days);
  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx > 80) { onUsed(item.id); return; }
      if (gesture.dx < -80) { onTrashed(item.id); return; }
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
    },
  });

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.bubble,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: style.bg, borderColor: style.border },
        { transform: pan.getTranslateTransform() },
      ]}
    >
      <Text style={styles.bubbleIcon}>{item.icon}</Text>
      <Text style={[styles.bubbleName, { color: style.text }]} numberOfLines={1}>{item.name}</Text>
      <Text style={[styles.bubbleDays, { color: style.text }]}>{dayLabel(days)}</Text>
    </Animated.View>
  );
}

export default function FridgeScreen({ navigation }: any) {
  const { items, fetchItems, setStatus } = useFridgeStore();

  useEffect(() => { fetchItems(); }, []);

  const activeItems = items.filter(i => i.status === 'active');
  const expiringCount = activeItems.filter(i => daysLeft(i.expiry_date) <= 2).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Fridge</Text>
        {expiringCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{expiringCount} expiring soon</Text>
          </View>
        )}
      </View>

      {/* Legend */}
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

      {/* Bubble canvas */}
      <View style={styles.canvas}>
        {activeItems.length === 0 ? (
          <Text style={styles.emptyText}>Your fridge is empty 🎉{'\n'}Add something!</Text>
        ) : (
          activeItems.map((item, i) => {
            const angle = (i / activeItems.length) * Math.PI * 2 - Math.PI / 2;
            const u = urgency(daysLeft(item.expiry_date));
            const maxR = Math.min(CANVAS_W, CANVAS_H) * 0.36;
            const r = maxR * (1 - u * 0.7);
            const size = getBubbleSize(daysLeft(item.expiry_date));
            const x = CANVAS_W / 2 + Math.cos(angle) * r - size / 2;
            const y = CANVAS_H / 2 + Math.sin(angle) * r - size / 2;

            return (
              <View key={item.id} style={{ position: 'absolute', left: x, top: y }}>
                <Bubble
                  item={item}
                  onUsed={(id) => setStatus(id, 'used')}
                  onTrashed={(id) => setStatus(id, 'trashed')}
                />
              </View>
            );
          })
        )}
      </View>

      <Text style={styles.hint}>Swipe right → used · Swipe left → toss</Text>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate('AddItem')}
        >
          <Text style={styles.actionBtnText}>+ Add item</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={() => navigation.navigate('Recipes')}
        >
          <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Recipe ideas ↗</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '600', color: '#111' },
  badge: { backgroundColor: '#FEF3C7', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, color: '#92400E', fontWeight: '500' },
  legend: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: '#888' },
  canvas: {
    width: CANVAS_W, height: CANVAS_H,
    backgroundColor: '#f8f8f8', borderRadius: 16, position: 'relative',
    borderWidth: 0.5, borderColor: '#eee', overflow: 'hidden',
  },
  bubble: {
    position: 'absolute', borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', padding: 4,
  },
  bubbleIcon: { fontSize: 20 },
  bubbleName: { fontSize: 9, fontWeight: '500', textAlign: 'center', maxWidth: '90%' },
  bubbleDays: { fontSize: 8, opacity: 0.85 },
  emptyText: { textAlign: 'center', marginTop: 120, color: '#aaa', fontSize: 15, lineHeight: 24 },
  hint: { fontSize: 11, color: '#bbb', textAlign: 'center', marginTop: 8, marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1, backgroundColor: '#1D9E75', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  actionBtnSecondary: { backgroundColor: '#f0fdf9', borderWidth: 1, borderColor: '#1D9E75' },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  actionBtnTextSecondary: { color: '#1D9E75' },
});
