export const formatCamelCase = (text: string): string => {
  if (!text) return text;

  const spacedText = text.replace(/([a-z])([A-Z])/g, "$1 $2");

  return spacedText
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};
