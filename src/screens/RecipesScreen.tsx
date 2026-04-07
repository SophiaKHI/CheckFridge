import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useFridgeStore } from '../store/fridgeStore';
import { daysLeft } from '../lib/expiry';
import { Recipe } from '../types';

const PROXY_URL = process.env.EXPO_PUBLIC_OPENAI_PROXY_URL ?? '';

async function fetchRecipes(items: string[]): Promise<Recipe[]> {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a helpful chef. Given a list of fridge items that need to be used soon,
suggest 3 practical recipes. Respond with a JSON array of recipes with this shape:
[{ "title": string, "description": string, "ingredients": string[], "steps": string[], "usesItems": string[] }]
Only return the JSON array, no markdown.`,
        },
        {
          role: 'user',
          content: `My fridge items to use soon: ${items.join(', ')}. Suggest 3 recipes.`,
        },
      ],
      max_tokens: 1200,
    }),
  });

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? '[]';
  return JSON.parse(content) as Recipe[];
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity style={styles.card} onPress={() => setExpanded(!expanded)} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{recipe.title}</Text>
        <Text style={styles.cardChevron}>{expanded ? '▲' : '▼'}</Text>
      </View>
      <Text style={styles.cardDesc}>{recipe.description}</Text>
      <View style={styles.usesRow}>
        {recipe.usesItems.map(i => (
          <View key={i} style={styles.useChip}><Text style={styles.useChipText}>uses {i}</Text></View>
        ))}
      </View>
      {expanded && (
        <>
          <Text style={styles.sectionLabel}>Ingredients</Text>
          {recipe.ingredients.map((ing, idx) => (
            <Text key={idx} style={styles.listItem}>• {ing}</Text>
          ))}
          <Text style={styles.sectionLabel}>Steps</Text>
          {recipe.steps.map((step, idx) => (
            <Text key={idx} style={styles.listItem}>{idx + 1}. {step}</Text>
          ))}
        </>
      )}
    </TouchableOpacity>
  );
}

export default function RecipesScreen() {
  const { items } = useFridgeStore();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expiringItems = items
    .filter(i => i.status === 'active' && daysLeft(i.expiry_date) <= 6)
    .map(i => `${i.icon} ${i.name} (${daysLeft(i.expiry_date)}d left)`);

  const handleGenerate = async () => {
    if (!PROXY_URL) {
      setError('OpenAI proxy not configured yet — Anna needs to set this up!');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRecipes(expiringItems);
      setRecipes(result);
    } catch (e: any) {
      setError('Failed to get recipes. Try again!');
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Recipe ideas</Text>
      <Text style={styles.subtitle}>Based on what's expiring soon in your fridge</Text>

      {expiringItems.length > 0 ? (
        <View style={styles.itemsBox}>
          {expiringItems.map((item, i) => (
            <Text key={i} style={styles.itemLine}>{item}</Text>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>Nothing expiring soon — your fridge looks good! 🎉</Text>
      )}

      <TouchableOpacity
        style={[styles.btn, (loading || expiringItems.length === 0) && styles.btnDisabled]}
        onPress={handleGenerate}
        disabled={loading || expiringItems.length === 0}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.btnText}>✨ Generate recipe ideas</Text>
        }
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}

      {recipes.map((r, i) => <RecipeCard key={i} recipe={r} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 },
  title: { fontSize: 22, fontWeight: '600', color: '#111', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#888', marginBottom: 16 },
  itemsBox: {
    backgroundColor: '#f8f8f8', borderRadius: 12, padding: 14,
    marginBottom: 16, borderWidth: 0.5, borderColor: '#eee',
  },
  itemLine: { fontSize: 13, color: '#444', marginBottom: 4 },
  emptyText: { fontSize: 14, color: '#aaa', marginBottom: 16 },
  btn: {
    backgroundColor: '#1D9E75', borderRadius: 12, padding: 16,
    alignItems: 'center', marginBottom: 20,
  },
  btnDisabled: { backgroundColor: '#ccc' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  error: { color: '#E24B4A', fontSize: 13, marginBottom: 12 },
  card: {
    backgroundColor: '#fafafa', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 0.5, borderColor: '#e5e5e5',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111', flex: 1 },
  cardChevron: { fontSize: 12, color: '#aaa' },
  cardDesc: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 8 },
  usesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  useChip: { backgroundColor: '#f0fdf9', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  useChipText: { fontSize: 11, color: '#1D9E75' },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#888', marginTop: 12, marginBottom: 4 },
  listItem: { fontSize: 13, color: '#444', marginBottom: 4, lineHeight: 20 },
});
