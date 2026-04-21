-- ============================================================
-- Seed: expiry_reference
-- Common fridge items with typical refrigerator shelf life.
-- fridge_days is the expected days until expiry when stored
-- in the fridge (not freezer). NULL = not typically fridged.
--
-- Run in the Supabase SQL editor or via:
--   supabase db reset  (if using local dev)
-- ============================================================

truncate table public.expiry_reference restart identity;

insert into public.expiry_reference (name, icon, category, fridge_days) values

-- ─── Dairy ───────────────────────────────────────────────
('Milk',              '🥛', 'dairy',     7),
('Whole Milk',        '🥛', 'dairy',     7),
('Skim Milk',         '🥛', 'dairy',     7),
('Oat Milk',          '🥛', 'dairy',     10),
('Heavy Cream',       '🫙', 'dairy',     10),
('Sour Cream',        '🫙', 'dairy',     14),
('Butter',            '🧈', 'dairy',     30),
('Cheddar Cheese',    '🧀', 'dairy',     21),
('Mozzarella',        '🧀', 'dairy',     7),
('Parmesan',          '🧀', 'dairy',     30),
('Cream Cheese',      '🧀', 'dairy',     14),
('Cottage Cheese',    '🫙', 'dairy',     7),
('Greek Yogurt',      '🫙', 'dairy',     14),
('Yogurt',            '🫙', 'dairy',     10),
('Eggs',              '🥚', 'dairy',     35),

-- ─── Meat & Fish ─────────────────────────────────────────
('Chicken Breast',    '🍗', 'meat',      2),
('Chicken Thighs',    '🍗', 'meat',      2),
('Whole Chicken',     '🍗', 'meat',      2),
('Ground Beef',       '🥩', 'meat',      2),
('Beef Steak',        '🥩', 'meat',      3),
('Pork Chops',        '🥩', 'meat',      3),
('Bacon',             '🥓', 'meat',      7),
('Ham',               '🍖', 'meat',      5),
('Deli Turkey',       '🍖', 'meat',      5),
('Deli Salami',       '🍖', 'meat',      5),
('Salmon',            '🐟', 'meat',      2),
('Shrimp',            '🦐', 'meat',      2),
('Tuna Steak',        '🐟', 'meat',      2),
('Sausages',          '🌭', 'meat',      3),
('Hot Dogs',          '🌭', 'meat',      7),

-- ─── Produce — Vegetables ─────────────────────────────────
('Spinach',           '🥬', 'produce',   5),
('Lettuce',           '🥬', 'produce',   7),
('Kale',              '🥬', 'produce',   7),
('Broccoli',          '🥦', 'produce',   7),
('Cauliflower',       '🥦', 'produce',   7),
('Carrots',           '🥕', 'produce',   21),
('Celery',            '🥬', 'produce',   14),
('Bell Pepper',       '🫑', 'produce',   10),
('Cucumber',          '🥒', 'produce',   7),
('Zucchini',          '🥒', 'produce',   7),
('Tomatoes',          '🍅', 'produce',   7),
('Cherry Tomatoes',   '🍅', 'produce',   7),
('Mushrooms',         '🍄', 'produce',   7),
('Asparagus',         '🌿', 'produce',   4),
('Green Beans',       '🫛', 'produce',   7),
('Corn',              '🌽', 'produce',   3),
('Avocado',           '🥑', 'produce',   3),
('Lemons',            '🍋', 'produce',   21),
('Limes',             '🍋', 'produce',   21),

-- ─── Produce — Fruit ─────────────────────────────────────
('Strawberries',      '🍓', 'produce',   5),
('Blueberries',       '🫐', 'produce',   10),
('Raspberries',       '🫐', 'produce',   3),
('Grapes',            '🍇', 'produce',   10),
('Watermelon',        '🍉', 'produce',   5),
('Melon',             '🍈', 'produce',   5),

-- ─── Leftovers & Prepared ─────────────────────────────────
('Leftovers',         '🍱', 'leftovers', 3),
('Cooked Rice',       '🍚', 'leftovers', 4),
('Cooked Pasta',      '🍝', 'leftovers', 4),
('Soup',              '🍲', 'leftovers', 4),
('Pizza',             '🍕', 'leftovers', 4),
('Cooked Chicken',    '🍗', 'leftovers', 3),

-- ─── Drinks ──────────────────────────────────────────────
('Orange Juice',      '🧃', 'drinks',    7),
('Apple Juice',       '🧃', 'drinks',    10),
('Sparkling Water',   '💧', 'drinks',    null),
('White Wine',        '🍷', 'drinks',    5),
('Beer',              '🍺', 'drinks',    null),

-- ─── Condiments & Sauces ─────────────────────────────────
('Ketchup',           '🍅', 'condiments', 180),
('Mustard',           '🫙', 'condiments', 365),
('Mayonnaise',        '🫙', 'condiments', 60),
('Hot Sauce',         '🌶️', 'condiments', 180),
('Salsa',             '🫙', 'condiments', 14),
('Hummus',            '🫙', 'condiments', 7),
('Pesto',             '🌿', 'condiments', 7),
('Salad Dressing',    '🫙', 'condiments', 60),
('Soy Sauce',         '🫙', 'condiments', 730),
('Butter (Opened)',   '🧈', 'condiments', 14);
