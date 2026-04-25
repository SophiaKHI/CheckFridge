/**
 * Opened shelf-life lookup.
 * Items that have a notably shorter fridge life once the seal is broken.
 */

const EXACT: Record<string, number> = {
  'yogurt':          3,
  'greek yogurt':    3,
  'yoghurt':         3,
  'greek yoghurt':   3,
  'cream cheese':    7,
  'milk':            5,
  'whole milk':      5,
  'skim milk':       5,
  'oat milk':        5,
  'heavy cream':     5,
  'sour cream':      7,
  'cottage cheese':  5,
  'orange juice':    5,
  'apple juice':     5,
  'hummus':          7,
  'salsa':           5,
  'pasta sauce':     5,
  'pesto':           5,
  'salad dressing':  30,
  'jam':             90,
  'jelly':           90,
  'mayonnaise':      60,
  'ketchup':         60,
  'mustard':         60,
  'hot sauce':       60,
  'soy sauce':       180,
  'butter (opened)': 14,
};

// Ordered from most-specific to least-specific to avoid false matches
const PATTERNS: Array<[RegExp, number]> = [
  [/yogh?urt/i,                       3  ],
  [/sour cream/i,                      7  ],
  [/cream cheese/i,                    7  ],
  [/heavy cream|whipping cream/i,      5  ],
  [/\bmilk\b/i,                        5  ],
  [/\bjuice\b/i,                       5  ],
  [/\bhummus\b/i,                      7  ],
  [/\bsalsa\b/i,                       5  ],
  [/pasta sauce/i,                     5  ],
  [/\bpesto\b/i,                       5  ],
  [/\bjam\b/i,                         90 ],
  [/\bjelly\b/i,                       90 ],
  [/mayo(nnaise)?/i,                   60 ],
  [/\bketchup\b/i,                     60 ],
  [/\bmustard\b/i,                     60 ],
  [/hot sauce/i,                       60 ],
  [/soy sauce/i,                       180],
  [/\bdressing\b/i,                    30 ],
  [/\bsauce\b/i,                       14 ],
  [/\bcream\b/i,                       5  ],
];

/**
 * Returns days after opening before the item expires, or null if the item
 * is not in the opened-expiry list.
 *
 * Pass `fridgeDays` to enable a 50%-of-sealed fallback for items found in
 * expiry_reference but not listed here (used by ScanFridge / AddItem).
 */
export function getOpenedDays(name: string, fridgeDays?: number): number | null {
  const lower = name.toLowerCase().trim();

  if (EXACT[lower] !== undefined) return EXACT[lower];

  for (const [re, days] of PATTERNS) {
    if (re.test(lower)) return days;
  }

  if (fridgeDays != null && fridgeDays > 0) {
    return Math.max(1, Math.round(fridgeDays * 0.5));
  }

  return null;
}

/** True if this item is in the known opened-expiry list (no fallback). */
export const isOpenable = (name: string): boolean => getOpenedDays(name) !== null;
