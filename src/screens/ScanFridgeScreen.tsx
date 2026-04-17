import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, TextInput, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { format, addDays } from 'date-fns';
import { useFridgeStore } from '../store/fridgeStore';

const QUICK_EXPIRY = [
  { label: 'Today', days: 0 },
  { label: '3d',    days: 3 },
  { label: '5d',    days: 5 },
  { label: '1w',    days: 7 },
  { label: '2w',    days: 14 },
];

interface DetectedItem {
  name: string;
  icon: string;
  expiryDays: number;
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

      console.log('[ScanFridge] apiKey:', apiKey);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const body = JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: photo.base64 } },
            { text: `Analyze this fridge photo. List every visible food item.
Return ONLY a raw JSON array — no markdown, no code fences, just JSON — like:
[{"name":"Milk","icon":"🥛","daysUntilExpiry":5},{"name":"Eggs","icon":"🥚","daysUntilExpiry":14}]
Rules:
- Use a single relevant food emoji for icon
- Be conservative with expiry (err on the side of shorter)
- Only include items you can clearly identify
- If the fridge is empty or no food is visible, return []` },
          ],
        }],
      });

      // Retry with exponential backoff on 429 (rate limit)
      let response: Response | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, 1500 * Math.pow(2, attempt - 1))); // 1.5s, 3s, 6s
        }
        response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        if (response.status !== 429) break;
        console.log(`[ScanFridge] 429 rate limit, retrying (attempt ${attempt + 1})…`);
      }

      if (!response!.ok) {
        const err = await response!.json();
        throw new Error(err.error?.message ?? `Gemini error ${response!.status}`);
      }

      const data = await response!.json();
      const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
        .replace(/^```json?\n?/, '')
        .replace(/\n?```$/, '');

      const parsed: Array<{ name: string; icon: string; daysUntilExpiry: number }> = JSON.parse(raw);

      setDetectedItems(parsed.map(i => ({
        name: i.name,
        icon: i.icon || '🍽️',
        expiryDays: Math.max(0, Math.round(i.daysUntilExpiry)),
      })));
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
      await addItem({
        name: item.name,
        icon: item.icon,
        expiry_date: format(addDays(new Date(), item.expiryDays), 'yyyy-MM-dd'),
      });
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
            <View style={styles.expiryRow}>
              {QUICK_EXPIRY.map(q => (
                <TouchableOpacity
                  key={q.label}
                  style={[styles.expiryChip, item.expiryDays === q.days && styles.expiryChipActive]}
                  onPress={() => updateItem(index, { expiryDays: q.days })}
                >
                  <Text style={[styles.expiryChipText, item.expiryDays === q.days && styles.expiryChipTextActive]}>
                    {q.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.expiryDate}>
                {item.expiryDays === 0 ? 'expires today' : `expires ${format(addDays(new Date(), item.expiryDays), 'MMM d')}`}
              </Text>
            </View>
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
});
