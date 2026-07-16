import type { WorkNote, WorkNoteExtraData } from '@time-tracker/domain';
import { Clock3, Plus, Save, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { appStore } from '../../app/store';
import { formatCompactDuration } from '../timer/time';

type NoteFields = { content: string; hours: string; minutes: string };

function fieldsFromNote(note?: WorkNote): NoteFields {
  const timeSpentMs = note?.extraData.timeSpentMs;
  return {
    content: note?.content ?? '',
    hours: timeSpentMs ? String(Math.floor(timeSpentMs / 3_600_000)) : '',
    minutes: timeSpentMs ? String(Math.floor((timeSpentMs % 3_600_000) / 60_000)) : '',
  };
}

function toExtraData(fields: NoteFields, existing: WorkNoteExtraData = {}) {
  const hours = fields.hours ? Number(fields.hours) : 0;
  const minutes = fields.minutes ? Number(fields.minutes) : 0;
  if (
    !Number.isInteger(hours) ||
    hours < 0 ||
    !Number.isInteger(minutes) ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error('Use whole hours and 0–59 minutes for time spent.');
  }
  const extraData = { ...existing };
  const timeSpentMs = hours * 3_600_000 + minutes * 60_000;
  if (timeSpentMs) extraData.timeSpentMs = timeSpentMs;
  else delete extraData.timeSpentMs;
  return extraData;
}

function timestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function WorkNotesPanel({
  entryId,
  notes,
  actions,
  compact = false,
  readOnly = false,
}: {
  entryId: string;
  notes: WorkNote[];
  actions: typeof appStore;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState<NoteFields>(fieldsFromNote());
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<NoteFields>(fieldsFromNote());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addNote() {
    setSaving(true);
    setError(null);
    try {
      await actions.createWorkNote(entryId, {
        content: draft.content,
        extraData: toExtraData(draft),
      });
      setDraft(fieldsFromNote());
      setCreating(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The note could not be added.');
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(note: WorkNote) {
    setSaving(true);
    setError(null);
    try {
      await actions.updateWorkNote(note.id, {
        content: editing.content,
        extraData: toExtraData(editing, note.extraData),
      });
      setEditingId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The note could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(note: WorkNote) {
    if (!window.confirm('Delete this work note? This cannot be undone.')) return;
    setSaving(true);
    setError(null);
    try {
      await actions.deleteWorkNote(note.id);
      if (editingId === note.id) setEditingId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The note could not be deleted.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Work notes">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="m-0 text-xs text-surface-muted-foreground">
          {notes.length
            ? `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`
            : 'No notes yet'}
        </p>
        {!readOnly ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setEditingId(null);
              setCreating(true);
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-surface-muted disabled:opacity-45"
          >
            <Plus size={13} /> New note
          </button>
        ) : (
          <span className="text-[11px] font-semibold text-warning">Finalized</span>
        )}
      </div>
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        {notes.map((note) =>
          editingId === note.id ? (
            <div key={note.id} className="rounded-lg border bg-background p-3">
              <NoteFieldsEditor fields={editing} onChange={setEditing} autoFocus />
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {!readOnly ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void deleteNote(note)}
                    className="mr-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger-container"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditingId(null)}
                  className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                >
                  <X size={13} /> Cancel
                </button>
                <button
                  type="button"
                  disabled={saving || !editing.content.trim()}
                  onClick={() => void saveEdit(note)}
                  className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-45"
                >
                  <Save size={13} /> {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <article key={note.id} className="rounded-lg border bg-background px-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <p className="m-0 min-w-0 flex-1 truncate text-sm" title={note.content}>
                  {note.content}
                </p>
                <span className="hidden shrink-0 text-[11px] text-surface-muted-foreground sm:inline">
                  {timestamp(note.createdAt)}
                </span>
                {note.extraData.timeSpentMs ? (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-foreground">
                    <Clock3 size={11} /> {formatCompactDuration(note.extraData.timeSpentMs)}
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setCreating(false);
                    setEditingId(note.id);
                    setEditing(fieldsFromNote(note));
                  }}
                  className="shrink-0 rounded-md bg-surface-muted px-2.5 py-1 text-xs font-semibold hover:bg-primary-container hover:text-primary"
                >
                  Open
                </button>
              </div>
            </article>
          ),
        )}
      </div>

      {creating && !readOnly ? (
        <div
          className={`${notes.length ? 'mt-3' : ''} rounded-lg border border-dashed bg-background/60 p-3`}
        >
          <NoteFieldsEditor
            fields={draft}
            onChange={setDraft}
            placeholder="Add a small work note…"
            autoFocus
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-[11px] text-surface-muted-foreground">
              Time spent is optional metadata and does not change tracked time.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setCreating(false);
                  setDraft(fieldsFromNote());
                }}
                className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
              >
                <X size={13} /> Cancel
              </button>
              <button
                type="button"
                disabled={saving || !draft.content.trim()}
                onClick={() => void addNote()}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-45"
              >
                <Plus size={13} /> {saving ? 'Adding…' : 'Add note'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-lg bg-danger-container px-3 py-2 text-xs text-danger">{error}</p>
      ) : null}
    </section>
  );
}

function NoteFieldsEditor({
  fields,
  onChange,
  placeholder = 'Work note',
  autoFocus = false,
}: {
  fields: NoteFields;
  onChange: (fields: NoteFields) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      <label className="grid gap-1 text-[11px] font-medium text-surface-muted-foreground">
        Note
        <textarea
          autoFocus={autoFocus}
          rows={2}
          value={fields.content}
          onChange={(event) => onChange({ ...fields, content: event.target.value })}
          placeholder={placeholder}
          className="min-h-14 resize-y rounded-lg border bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <fieldset className="min-w-0 rounded-lg bg-surface-muted/55 px-3 py-2.5">
        <legend className="px-1 text-[11px] font-medium text-surface-muted-foreground">
          Time spent <span className="font-normal">(optional)</span>
        </legend>
        <div className="grid max-w-56 grid-cols-2 gap-2">
          <label className="grid min-w-0 gap-1 text-[11px] text-surface-muted-foreground">
            Hours
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={fields.hours}
              onChange={(event) => onChange({ ...fields, hours: event.target.value })}
              placeholder="0"
              className="min-w-0 rounded-lg border bg-card px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-[11px] text-surface-muted-foreground">
            Minutes
            <input
              type="number"
              min="0"
              max="59"
              step="1"
              inputMode="numeric"
              value={fields.minutes}
              onChange={(event) => onChange({ ...fields, minutes: event.target.value })}
              placeholder="0"
              className="min-w-0 rounded-lg border bg-card px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
      </fieldset>
    </div>
  );
}
