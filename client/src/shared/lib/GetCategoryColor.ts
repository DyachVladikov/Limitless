export type CategoryNames =
  | "study"
  | "sport"
  | "health"
  | "work"
  | "rationality";

const categoryColors: Record<CategoryNames, string> = {
  study: "#8B5CF6",
  sport: "#3A86FF",
  health: "#FB923C",
  work: "#06D6A0",
  rationality: "#E63946",
};

export const getCategoryColor = (category: CategoryNames) =>
  categoryColors[category] || "var(--color-gray-60)";
