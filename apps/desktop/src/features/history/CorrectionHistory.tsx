import type { TimeEntryCorrection } from '@time-tracker/domain';
import { useState } from 'react';

function describeChange(item: TimeEntryCorrection) {
  const changes: string[] = [];
  if (
    item.before.taskId !== item.after.taskId ||
    item.before.taskTitle !== item.after.taskTitle ||
    item.before.taskExternalId !== item.after.taskExternalId
  )
    changes.push(`task: ${item.before.taskTitle} → ${item.after.taskTitle}`);
  if (item.before.groupId !== item.after.groupId || item.before.groupName !== item.after.groupName)
    changes.push(
      `group: ${item.before.groupName ?? 'Ungrouped'} → ${item.after.groupName ?? 'Ungrouped'}`,
    );
  if (JSON.stringify(item.before.category) !== JSON.stringify(item.after.category))
    changes.push(
      `category: ${item.before.category?.name ?? 'Uncategorized'} → ${item.after.category?.name ?? 'Uncategorized'}`,
    );
  const beforeTags = item.before.tags.map((tag) => tag.name).join(', ') || 'None';
  const afterTags = item.after.tags.map((tag) => tag.name).join(', ') || 'None';
  if (beforeTags !== afterTags) changes.push(`tags: ${beforeTags} → ${afterTags}`);
  if (item.before.startedAt !== item.after.startedAt)
    changes.push(
      `start: ${new Date(item.before.startedAt).toLocaleString()} → ${new Date(item.after.startedAt).toLocaleString()}`,
    );
  if (item.before.endedAt !== item.after.endedAt)
    changes.push(
      `end: ${item.before.endedAt ? new Date(item.before.endedAt).toLocaleString() : 'Running'} → ${item.after.endedAt ? new Date(item.after.endedAt).toLocaleString() : 'Running'}`,
    );
  return changes;
}

export function CorrectionHistory({
  entryId,
  count,
  load,
}: {
  entryId: string;
  count: number;
  load: (id: string) => Promise<TimeEntryCorrection[]>;
}) {
  const [items, setItems] = useState<TimeEntryCorrection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!count) return null;
  return (
    <details
      className="border-t bg-warning-container/15 px-4 py-2.5"
      onToggle={(event) => {
        if (!event.currentTarget.open || items) return;
        void load(entryId)
          .then(setItems)
          .catch((caught) =>
            setError(caught instanceof Error ? caught.message : 'Could not load corrections.'),
          );
      }}
    >
      <summary className="cursor-pointer text-xs font-semibold text-warning">
        Edited {count} {count === 1 ? 'time' : 'times'} · View audit history
      </summary>
      <div className="space-y-2 pt-3 pb-1">
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        {!items && !error ? (
          <p className="text-xs text-surface-muted-foreground">Loading…</p>
        ) : null}
        {items?.map((item) => (
          <div key={item.id} className="rounded-lg border bg-card p-3 text-xs">
            <div className="flex justify-between gap-3">
              <strong>{item.reason}</strong>
              <time className="shrink-0 text-surface-muted-foreground">
                {new Date(item.createdAt).toLocaleString()}
              </time>
            </div>
            <ul className="mt-2 mb-0 space-y-1 pl-4 text-surface-muted-foreground">
              {describeChange(item).map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
