import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Dimensions, Animated, PanResponder } from 'react-native';
import { useState, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const { width } = Dimensions.get('window');

const initialItems = [
  { id: 1, name: 'Milk', icon: '🥛', daysLeft: -1 },
  { id: 2, name: 'Eggs', icon: '🥚', daysLeft: 5 },
  { id: 3, name: 'Cheese', icon: '🧀', daysLeft: 2 },
  { id: 4, name: 'Chicken', icon: '🍗', daysLeft: 1 },
  { id: 5, name: 'Spinach', icon: '🥬', daysLeft: 8 },
  { id: 6, name: 'Yogurt', icon: '🫙', daysLeft: 4 },
  { id: 7, name: 'Butter', icon: '🧈', daysLeft: 14 },
  { id: 8, name: 'Salmon', icon: '🐟', daysLeft: 0 },
];

function getColor(d: number) {
  if (d <= 0) return { bg: '#F7C1C1', border: '#E24B4A', text: '#791F1F' };
  if (d <= 2) return { bg: '#F5C4B3', border: '#D85A30', text: '#712B13' };
  if (d <= 6) return { bg: '#FAC775', border: '#BA7517', text: '#633806' };
  return { bg: '#9FE1CB', border: '#1D9E75', text: '#085041' };
}

function dayLabel(d: number) {
  if (d < 0) return 'expired';
  if (d === 0) return 'today!';
  if (d === 1) return '1 day';
  return `${d} days`;
}

type Item = typeof initialItems[0];

function Bubble({ item, onUsed, onTrashed, onDragging }: {
  item: Item,
  onUsed: () => void,
  onTrashed: () => void,
  onDragging: (d: 'left' | 'right' | null) => void
}) {
  const c = getColor(item.daysLeft);
  const size = item.daysLeft <= 0 ? 80 : item.daysLeft <= 2 ? 85 : item.daysLeft <= 6 ? 90 : 95;
  const pan = useRef(new Animated.ValueXY()).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      Animated.spring(scale, { toValue: 1.15, useNativeDriver: true }).start();
    },
    onPanResponderMove: (_, g) => {
      pan.setValue({ x: g.dx, y: g.dy });
      if (g.dx > 60) onDragging('right');
      else if (g.dx < -60) onDragging('left');
      else onDragging(null);
    },
    onPanResponderRelease: (_, g) => {
      onDragging(null);
      if (g.dx > 80) {
        Animated.parallel([
          Animated.timing(pan, { toValue: { x: 400, y: 0 }, duration: 250, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]).start(onUsed);
      } else if (g.dx < -80) {
        Animated.parallel([
          Animated.timing(pan, { toValue: { x: -400, y: 0 }, duration: 250, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]).start(onTrashed);
      } else {
        Animated.parallel([
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }),
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
        ]).start();
      }
    },
  })).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[{
        transform: [...pan.getTranslateTransform(), { scale }],
        opacity,
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: c.bg, borderColor: c.border,
        borderWidth: 2,
        alignItems: 'center', justifyContent: 'center',
      }]}
    >
      <Text style={{ fontSize: 22 }}>{item.icon}</Text>
      <Text style={{ fontSize: 9, fontWeight: '500', color: c.text, marginTop: 1 }}>{item.name}</Text>
      <Text style={{ fontSize: 8, color: c.text, marginTop: 1 }}>{dayLabel(item.daysLeft)}</Text>
    </Animated.View>
  );
}

export default function App() {
  const [items, setItems] = useState(initialItems);
  const [used, setUsed] = useState<Item[]>([]);
  const [trashed, setTrashed] = useState<Item[]>([]);
  const [dragging, setDragging] = useState<'left' | 'right' | null>(null);

  function handleUsed(id: number) {
    const item = items.find(i => i.id === id);
    if (item) { setUsed(p => [...p, item]); setItems(p => p.filter(i => i.id !== id)); }
  }

  function handleTrashed(id: number) {
    const item = items.find(i => i.id === id);
    if (item) { setTrashed(p => [...p, item]); setItems(p => p.filter(i => i.id !== id)); }
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <Text style={styles.title}>My Fridge</Text>
        <Text style={styles.hint}>← trash  ·  used →</Text>

        <View style={styles.bins}>
          <View style={[styles.bin, styles.binLeft, dragging === 'left' && styles.binActiveLeft]}>
            <Text style={styles.binIcon}>🗑️</Text>
            <Text style={styles.binLabel}>Thrown{'\n'}away</Text>
            <Text style={styles.binCount}>{trashed.length}</Text>
          </View>
          <View style={[styles.bin, styles.binRight, dragging === 'right' && styles.binActiveRight]}>
            <Text style={styles.binIcon}>✅</Text>
            <Text style={styles.binLabel}>Used{'\n'}up</Text>
            <Text style={styles.binCount}>{used.length}</Text>
          </View>
        </View>

        <View style={styles.bubblesWrap}>
          {items.map((item, i) => {
            const angle = (i / items.length) * Math.PI * 2;
            const urgency = item.daysLeft <= 0 ? 0.15 : item.daysLeft <= 2 ? 0.35 : item.daysLeft <= 6 ? 0.6 : 0.85;
            const size = item.daysLeft <= 0 ? 80 : item.daysLeft <= 2 ? 85 : item.daysLeft <= 6 ? 90 : 95;
            const cx = width / 2 - size / 2;
            const rx = (width / 2 - size / 2 - 16) * urgency;
            const ry = 160 * urgency;
            const x = cx + Math.cos(angle) * rx;
            const y = 170 + Math.sin(angle) * ry;
            return (
              <View key={item.id} style={{ position: 'absolute', left: x, top: y }}>
                <Bubble
                  item={item}
                  onUsed={() => handleUsed(item.id)}
                  onTrashed={() => handleTrashed(item.id)}
                  onDragging={setDragging}
                />
              </View>
            );
          })}
        </View>

        {(used.length > 0 || trashed.length > 0) && (
          <View style={styles.history}>
            {trashed.length > 0 && (
              <View style={styles.historyBox}>
                <Text style={styles.historyTitle}>🗑️ Thrown away</Text>
                {trashed.map(item => (
                  <Text key={item.id} style={styles.historyItem}>{item.icon} {item.name}</Text>
                ))}
              </View>
            )}
            {used.length > 0 && (
              <View style={styles.historyBox}>
                <Text style={styles.historyTitle}>✅ Used up</Text>
                {used.map(item => (
                  <Text key={item.id} style={styles.historyItem}>{item.icon} {item.name}</Text>
                ))}
              </View>
            )}
          </View>
        )}
        <View style={styles.legend}>
          {[['#9FE1CB', 'Fresh'], ['#FAC775', 'Soon'], ['#F5C4B3', 'Expiring'], ['#F7C1C1', 'Expired']].map(([color, label]) => (
            <View key={label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>{label}</Text>
            </View>
          ))}
        </View>
        <StatusBar style="auto" />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '500', textAlign: 'center', color: '#111' },
  hint: { fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 4 },
  bins: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 12 },
  bin: { width: 70, alignItems: 'center', padding: 8, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed' },
  binLeft: { borderColor: '#E24B4A' },
  binRight: { borderColor: '#1D9E75' },
  binActiveLeft: { backgroundColor: '#FCEBEB', borderStyle: 'solid' },
  binActiveRight: { backgroundColor: '#E1F5EE', borderStyle: 'solid' },
  binIcon: { fontSize: 24 },
  binLabel: { fontSize: 10, color: '#888', textAlign: 'center', marginTop: 2 },
  binCount: { fontSize: 13, fontWeight: '500', color: '#111', marginTop: 2 },
  bubblesWrap: { flex: 1, position: 'relative' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingVertical: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: '#888' },legendText: { fontSize: 11, color: '#888' },
  history: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 8 },
  historyBox: { flex: 1, backgroundColor: '#f7f7f5', borderRadius: 10, padding: 10 },
  historyTitle: { fontSize: 12, fontWeight: '500', color: '#111', marginBottom: 6 },
  historyItem: { fontSize: 12, color: '#555', paddingVertical: 2 },
});
