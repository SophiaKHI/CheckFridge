import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, TextInput, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { format, addDays } from 'date-fns';
import { useFridgeStore } from '../store/fridgeStore';
import { supabase } from '../lib/supabase';
import { getOpenedDays } from '../lib/openedShelfLife';

const PURCHASE_AGO = [
  { label: 'Today',        days: 0  },
  { label: 'Few days ago', days: 3  },
  { label: '~1 week ago',  days: 7  },
  { label: '2+ weeks ago', days: 14 },
];

interface DetectedItem {
  name: string;
  icon: string;
  expiryDays: number;
  purchaseDaysAgo: number;
  /** true when expiryDays is estimated, not from reference data — renders a ~ prefix */
  isEstimate?: boolean;
  /** Set for pantry/shelf-stable items — shown as a small label above the purchase chips */
  storageNote?: string;
  /** Days after opening before expiry — defined for openable items only */
  openedDays?: number;
  /** Whether the user has toggled this item as already opened */
  isOpened?: boolean;
}

type Phase = 'camera' | 'analyzing' | 'review';

export default function ScanFridgeScreen({ navigation }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('camera');
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [adding, setAdding] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const { addItem, fetchItems } = useFridgeStore();

  const takePicture = async () => {
    if (!cameraRef.current) return;
    setPhase('analyzing');

    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (!photo?.base64) throw new Error('No image data captured');

      const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
      if (!apiKey || apiKey === 'your-gemini-api-key-here') {
        throw new Error('Add your Gemini API key to .env as EXPO_PUBLIC_GEMINI_API_KEY');
      }

      const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash-001'];
      const prompt = `Analyze this fridge photo. List every visible food item.
Return ONLY a raw JSON array — no markdown, no code fences, just JSON — like:
[{"name":"Milk","icon":"🥛"},{"name":"Eggs","icon":"🥚"}]
Rules:
- Use a single relevant food emoji for icon
- Use the most specific name you can (e.g. "Cheddar Cheese" not just "Cheese")
- Only include items you can clearly identify
- If the fridge is empty or no food is visible, return []`;

      // Try each model in order; retry up to 3 times with 5s waits on 429/503
      let response: Response | null = null;
      let responseBody = '';
      let lastError = '';
      outer: for (const model of MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
        const body = JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: 'image/jpeg', data: photo.base64 } },
            { text: prompt },
          ]}],
        });
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 5000));
          console.log(`[ScanFridge] trying ${model} attempt ${attempt + 1} (url: ${url})`);
          response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
          responseBody = await response.text();
          console.log(`[ScanFridge] ${model} attempt ${attempt + 1} → HTTP ${response.status}:`, responseBody);
          const retryable = response.status === 429 || response.status === 503;
          if (!retryable) break outer;
          lastError = `${model} HTTP ${response.status}`;
        }
        console.log(`[ScanFridge] ${model} exhausted, trying next model`);
      }

      if (!response!.ok) {
        const err = JSON.parse(responseBody || '{}');
        throw new Error(err.error?.message ?? lastError ?? `Gemini error ${response!.status}`);
      }

      const data = JSON.parse(responseBody);
      const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
        .replace(/^```json?\n?/, '')
        .replace(/\n?```$/, '');

      const parsed: Array<{ name: string; icon: string }> = JSON.parse(raw);

      // Fetch ALL reference rows — including pantry items (fridge_days = null)
      const { data: refs } = await supabase
        .from('expiry_reference')
        .select('name, icon, fridge_days');
      const refRows = (refs ?? []) as Array<{ name: string; icon: string; fridge_days: number | null }>;

      const firstWord = (s: string) => s.split(/\s+/).find(w => w.length >= 3) ?? '';

      const findRef = (itemName: string) => {
        const needle = itemName.toLowerCase().trim();

        // Pass 1: exact or substring match (e.g. "Whole Milk" ↔ "Milk")
        const p1 = refRows.find(r => {
          const hay = r.name.toLowerCase();
          return hay === needle || hay.includes(needle) || needle.includes(hay);
        });
        if (p1) return p1;

        // Pass 2: first-word match — handles spelling variants like "yoghurt" vs "yogurt"
        // Both "Greek Yoghurt" and "Greek Yogurt" share first word "greek"
        const nFirst = firstWord(needle);
        if (nFirst.length >= 3) {
          return refRows.find(r => firstWord(r.name.toLowerCase()) === nFirst);
        }
        return undefined;
      };

      // Keywords that strongly indicate a shelf-stable / pantry item.
      // Checked against the item name so "Canned Tuna" overrides a fresh-tuna reference match.
      const PANTRY_KEYWORDS = [
        'canned', 'tinned', 'crackers', 'cracker', 'chips', 'crisp', 'crisps',
        'biscuit', 'biscuits', 'cereal', 'pasta', 'rice', 'flour', 'sugar',
        'oil', 'vinegar', 'sauce', 'ketchup', 'mustard', 'jam', 'jelly',
        'pickle', 'pickled', 'dried', 'powder', 'mix', 'instant',
      ];
      const isPantryByName = (name: string) =>
        PANTRY_KEYWORDS.some(kw =>
          new RegExp(`(?:^|\\s)${kw}(?:\\s|$)`, 'i').test(name)
        );

      // Smart shelf-life estimation for items not in reference data
      const estimateShelfDays = (name: string): number => {
        const lower = name.toLowerCase();
        if (/yogh?urt|dairy|cheese|milk|cream/.test(lower))           return 14;
        if (/\bmeat\b|chicken|beef|fish|salmon|tuna|pork|lamb/.test(lower)) return 3;
        if (/vegetable|salad|lettuce|spinach|herb|kale|cabbage/.test(lower)) return 5;
        if (/\bfruit\b|berr(y|ies)|apple|orange|grape|melon/.test(lower)) return 7;
        if (/leftover|cooked/.test(lower))                             return 3;
        return 7;
      };

      setDetectedItems(parsed.map(i => {
        const ref = findRef(i.name);
        const pantry = isPantryByName(i.name) || (ref?.fridge_days === null);

        let expiryDays: number;
        let isEstimate: boolean;

        if (pantry) {
          // Shelf-stable — give a long rough estimate; user is warned by storageNote
          expiryDays = 90;
          isEstimate = true;
        } else if (ref?.fridge_days != null) {
          expiryDays = ref.fridge_days;
          isEstimate = false;
        } else {
          expiryDays = estimateShelfDays(i.name);
          isEstimate = true;
        }

        console.log(
          `[Scan] "${i.name}" → ref="${ref?.name ?? 'none'}" fridge_days=${ref?.fridge_days ?? 'none'} ` +
          `pantry=${pantry} expiryDays=${expiryDays} isEstimate=${isEstimate}`,
        );

        // getOpenedDays with fridgeDays fallback so ref-matched items also get a toggle
        const openedDays = getOpenedDays(i.name, ref?.fridge_days ?? undefined) ?? undefined;
        return {
          name: i.name,
          icon: i.icon ?? '🍽️',
          expiryDays,
          purchaseDaysAgo: 0,
          isEstimate,
          storageNote: pantry ? '🏠 Store outside fridge' : undefined,
          openedDays,
          isOpened: false,
        };
      }));
      setPhase('review');
    } catch (err: any) {
      setPhase('camera');
      Alert.alert('Scan failed', err.message ?? 'Could not analyse the image');
    }
  };

  const removeItem = (index: number) => {
    setDetectedItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, updates: Partial<DetectedItem>) => {
    setDetectedItems(prev =>
      prev.map((item, i) => i === index ? { ...item, ...updates } : item)
    );
  };

  const addAll = async () => {
    setAdding(true);
    for (const item of detectedItems) {
      const expiryDate =
        item.isOpened && item.openedDays != null
          ? format(addDays(new Date(), item.openedDays), 'yyyy-MM-dd')
          : format(addDays(new Date(), item.expiryDays - item.purchaseDaysAgo), 'yyyy-MM-dd');
      await addItem({ name: item.name, icon: item.icon, expiry_date: expiryDate });
    }
    await fetchItems(); // sync store before navigating back
    setAdding(false);
    navigation.goBack();
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permText}>Camera access is needed to scan your fridge.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Grant permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'camera') {
    return (
      <View style={styles.container}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <View style={styles.cameraOverlay}>
            <View style={styles.hintPill}>
              <Text style={styles.hintText}>Open your fridge and point the camera inside</Text>
            </View>
            <TouchableOpacity style={styles.captureBtn} onPress={takePicture}>
              <View style={styles.captureInner} />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  if (phase === 'analyzing') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1D9E75" />
        <Text style={styles.analyzingText}>Scanning your fridge…</Text>
        <Text style={styles.analyzingSubText}>Gemini is identifying items</Text>
      </View>
    );
  }

  // Review phase
  return (
    <View style={styles.container}>
      <Text style={styles.reviewTitle}>
        {detectedItems.length === 0
          ? 'Nothing detected'
          : `Found ${detectedItems.length} item${detectedItems.length !== 1 ? 's' : ''}`}
      </Text>
      <Text style={styles.reviewSubTitle}>Edit names, icons, or expiry before adding</Text>

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 16 }}>
        {detectedItems.map((item, index) => (
          <View key={index} style={styles.itemCard}>
            <View style={styles.itemRow}>
              <TextInput
                style={styles.emojiInput}
                value={item.icon}
                onChangeText={v => updateItem(index, { icon: v })}
                maxLength={2}
              />
              <TextInput
                style={styles.nameInput}
                value={item.name}
                onChangeText={v => updateItem(index, { name: v })}
              />
              <TouchableOpacity onPress={() => removeItem(index)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.removeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            {item.storageNote && (
              <Text style={styles.storageNoteText}>{item.storageNote}</Text>
            )}
            {item.openedDays != null && (
              <View style={styles.sealedOpenedRow}>
                <TouchableOpacity
                  style={[styles.sealedChip, !item.isOpened && styles.sealedChipActive]}
                  onPress={() => updateItem(index, { isOpened: false })}
                >
                  <Text style={[styles.sealedChipText, !item.isOpened && styles.sealedChipTextActive]}>Sealed</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sealedChip, item.isOpened && styles.openedChipActive]}
                  onPress={() => updateItem(index, { isOpened: true })}
                >
                  <Text style={[styles.sealedChipText, item.isOpened && styles.openedChipTextActive]}>Opened</Text>
                </TouchableOpacity>
              </View>
            )}
            {!item.isOpened && (
              <View style={styles.purchaseRow}>
                <Text style={styles.purchaseLabel}>Bought:</Text>
                {PURCHASE_AGO.map(p => (
                  <TouchableOpacity
                    key={p.label}
                    style={[styles.expiryChip, item.purchaseDaysAgo === p.days && styles.expiryChipActive]}
                    onPress={() => updateItem(index, { purchaseDaysAgo: p.days })}
                  >
                    <Text style={[styles.expiryChipText, item.purchaseDaysAgo === p.days && styles.expiryChipTextActive]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                {(() => {
                  const net = item.expiryDays - item.purchaseDaysAgo;
                  const pre = item.isEstimate ? '~' : '';
                  return (
                    <Text style={styles.expiryDate}>
                      {net < 0 ? 'already expired' : net === 0 ? `${pre}expires today` : `${pre}expires ${format(addDays(new Date(), net), 'MMM d')}`}
                    </Text>
                  );
                })()}
              </View>
            )}
            {item.isOpened && item.openedDays != null && (
              <Text style={styles.openedExpiryText}>
                Opened today → expires {format(addDays(new Date(), item.openedDays), 'MMM d')}
              </Text>
            )}
          </View>
        ))}

        {detectedItems.length === 0 && (
          <Text style={styles.emptyHint}>
            Try again with the fridge door open and better lighting.
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.retryBtn} onPress={() => setPhase('camera')}>
          <Text style={styles.retryBtnText}>Retake</Text>
        </TouchableOpacity>
        {detectedItems.length > 0 && (
          <TouchableOpacity style={styles.addAllBtn} onPress={addAll} disabled={adding}>
            <Text style={styles.addAllBtnText}>
              {adding ? 'Adding…' : `Add ${detectedItems.length} item${detectedItems.length !== 1 ? 's' : ''}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', padding: 32,
  },
  camera: { flex: 1 },
  cameraOverlay: {
    flex: 1, backgroundColor: 'transparent',
    justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 48,
  },
  hintPill: {
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8, marginBottom: 32,
  },
  hintText: { color: '#fff', fontSize: 14, fontWeight: '500', textAlign: 'center' },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  captureInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff' },
  analyzingText: { marginTop: 20, fontSize: 17, fontWeight: '600', color: '#111' },
  analyzingSubText: { marginTop: 6, fontSize: 13, color: '#999' },
  permText: { fontSize: 15, color: '#555', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  primaryBtn: {
    backgroundColor: '#1D9E75', borderRadius: 12,
    paddingHorizontal: 28, paddingVertical: 13,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  reviewTitle: { fontSize: 20, fontWeight: '600', color: '#111', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 2 },
  reviewSubTitle: { fontSize: 13, color: '#999', paddingHorizontal: 20, paddingBottom: 12 },
  list: { flex: 1, paddingHorizontal: 16 },
  itemCard: {
    backgroundColor: '#f8f8f8', borderRadius: 12,
    padding: 12, marginBottom: 10,
    borderWidth: 0.5, borderColor: '#eee',
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  emojiInput: {
    fontSize: 22, width: 44, height: 40, textAlign: 'center',
    borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 8,
    backgroundColor: '#fff',
  },
  nameInput: {
    flex: 1, fontSize: 15, height: 40,
    borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 8,
    paddingHorizontal: 10, backgroundColor: '#fff',
  },
  removeBtn: { fontSize: 16, color: '#ccc', paddingHorizontal: 2 },
  expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  expiryChip: {
    backgroundColor: '#efefef', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'transparent',
  },
  expiryChipActive: { borderColor: '#1D9E75', backgroundColor: '#f0fdf9' },
  expiryChipText: { fontSize: 12, color: '#555' },
  expiryChipTextActive: { color: '#1D9E75', fontWeight: '500' },
  expiryDate: { fontSize: 11, color: '#aaa', marginLeft: 2 },
  emptyHint: { color: '#aaa', textAlign: 'center', marginTop: 60, fontSize: 14, lineHeight: 22 },
  footer: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 32 },
  retryBtn: {
    flex: 1, borderWidth: 1, borderColor: '#1D9E75',
    borderRadius: 12, paddingVertical: 13, alignItems: 'center',
  },
  retryBtnText: { color: '#1D9E75', fontWeight: '600', fontSize: 14 },
  addAllBtn: {
    flex: 2, backgroundColor: '#1D9E75',
    borderRadius: 12, paddingVertical: 13, alignItems: 'center',
  },
  addAllBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  purchaseRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 },
  purchaseLabel: { fontSize: 11, color: '#aaa' },
  storageNoteText: { fontSize: 12, color: '#888', marginTop: 6 },
  sealedOpenedRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  sealedChip: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 14,
    backgroundColor: '#efefef', borderWidth: 1, borderColor: 'transparent',
  },
  sealedChipActive: { borderColor: '#1D9E75', backgroundColor: '#f0fdf9' },
  openedChipActive: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  sealedChipText: { fontSize: 12, color: '#555' },
  sealedChipTextActive: { color: '#1D9E75', fontWeight: '600' },
  openedChipTextActive: { color: '#B45309', fontWeight: '600' },
  openedExpiryText: { fontSize: 12, color: '#B45309', marginTop: 6, fontWeight: '500' },
});
