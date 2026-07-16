export function toDateTimeInputValue(iso: string) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

export function fromDateTimeInputValue(value: string, unchangedIso?: string) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw new Error('Enter a valid date and time.');
  // datetime-local displays whole seconds, while recorded boundaries retain milliseconds. Keep the
  // exact persisted boundary when the visible field was not changed so an edit cannot introduce a
  // sub-second overlap with adjacent activity.
  if (unchangedIso && value === toDateTimeInputValue(unchangedIso)) return unchangedIso;
  return date.toISOString();
}
