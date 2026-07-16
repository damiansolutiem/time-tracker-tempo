export const taskColors = [
  { value: 'green', label: 'Green', className: 'bg-primary' },
  { value: 'blue', label: 'Blue', className: 'bg-info' },
  { value: 'amber', label: 'Amber', className: 'bg-warning' },
  { value: 'red', label: 'Red', className: 'bg-danger' },
] as const;

export function taskColorClass(value: string | null) {
  return taskColors.find((color) => color.value === value)?.className ?? 'bg-primary';
}
