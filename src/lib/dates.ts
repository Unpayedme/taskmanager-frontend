export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dueLabel(value: string | null): string {
  if (!value) return "No due date";
  const today = localDate();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (value === today) return "Today";
  if (value === localDate(tomorrow)) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(value.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {})
  }).format(new Date(`${value}T12:00:00`));
}
