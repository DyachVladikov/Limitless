// Public DTOs use camelCase, numeric quantities as JSON numbers, and opaque
// optimistic-lock versions as strings. Text that happens to contain digits stays text.
const numericFields = new Set([
  'total_exp','level_exp','next_level_exp','next_rank_exp','reward_xp','penalty_xp',
  'awarded_xp','assigned_reward_xp','done_awarded_xp','passed_awarded_xp','closed_awarded_xp',
  'weight_kg','portions','calories_per_portion','protein_per_portion','fat_per_portion','carbs_per_portion',
  'nutrition_goal_calories','nutrition_goal_protein','nutrition_goal_fat','nutrition_goal_carbs',
  'calories','protein','fat','carbs','duration_seconds','credited_seconds','count','total','done_count','passed_count',
]);
export function serialize(value: unknown, field = ''): unknown {
  if (value === null || value === undefined) return value;
  if (field === 'version' || field === 'profile_version') return String(value);
  if (typeof value === 'string' && numericFields.has(field) && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (Array.isArray(value)) return value.map(item => serialize(item));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item]) => [key.replace(/_([a-z])/g,(_,letter:string)=>letter.toUpperCase()),serialize(item,key)]));
  return value;
}
