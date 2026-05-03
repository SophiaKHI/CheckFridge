# expiry_reference table is live

hey! added a new table to supabase: **`expiry_reference`**. it's a ~200 item lookup of common foods with how long they typically last in the fridge. you can use it to replace the hardcoded `COMMON_ITEMS` array in `AddItemScreen.tsx` and auto-fill the expiry date when someone picks a common item.

## schema

| column       | type    | notes                                   |
|--------------|---------|-----------------------------------------|
| id           | bigint  | pk                                      |
| name         | text    | unique, e.g. "Chicken", "Spinach"       |
| category     | text    | dairy, meat, produce, etc.              |
| icon         | text    | emoji                                   |
| fridge_days  | int     | typical shelf life in fridge (nullable) |
| freezer_days | int     | typical shelf life in freezer (nullable)|
| pantry_days  | int     | typical shelf life in pantry (nullable) |

RLS is on — any authenticated user can read, nobody can write from the client. perfect for reference data.

## how to use it

**load all common items for the chip row** (replace `COMMON_ITEMS`):

```ts
const { data: commonItems } = await supabase
  .from('expiry_reference')
  .select('name, icon, fridge_days')
  .not('fridge_days', 'is', null)
  .order('name');
```

you might want to filter to a curated subset for the chips (e.g. most common 20) since showing all 200 is too many — either add a `popular` boolean column later, or just filter by category client-side.

**lookup one item by name** (when user types in the text input or vision API returns a name):

```ts
const { data } = await supabase
  .from('expiry_reference')
  .select('fridge_days, icon')
  .ilike('name', itemName)
  .maybeSingle();

if (data?.fridge_days != null) {
  const expiryDate = format(addDays(new Date(), data.fridge_days), 'yyyy-MM-dd');
  setExpiryDate(expiryDate);
  if (data.icon) setIcon(data.icon);
}
```

`.ilike` is case-insensitive so "chicken", "Chicken", "CHICKEN" all match.

## quick integration checklist

- [ ] remove the hardcoded `COMMON_ITEMS` array in `AddItemScreen.tsx`
- [ ] fetch from `expiry_reference` on mount (maybe via a new hook or the fridgeStore)
- [ ] when a chip is tapped, also auto-set `expiryDate` from `fridge_days` so the user doesn't have to pick the quick expiry button separately
- [ ] nice-to-have: same lookup after the vision API returns an item name, so scanned items get sensible defaults

## gotchas

- some foods have `fridge_days = null` (onions, potatoes, honey) — these live in the pantry, not the fridge. handle the null case or filter them out for the fridge chips
- the reference is a *hint*. once `expiry_date` is written to `fridge_items`, it's fixed. don't try to recompute from the reference later, and don't FK `fridge_items` to `expiry_reference` (custom items and vision-API results won't always match a row)
- numbers are conservative USDA-ish estimates. if something feels wrong in testing just let me know, they're easy to tweak

ping me if you hit anything weird 🫡
