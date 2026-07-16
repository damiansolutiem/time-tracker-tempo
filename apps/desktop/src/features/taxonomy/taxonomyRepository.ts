import type { WorkCategory, WorkLabelDraft, WorkTag } from '@time-tracker/domain';
import { openDatabase } from '../../infrastructure/database/client';

type LabelRow = {
  id: string;
  name: string;
  color: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type Kind = 'category' | 'tag';

const tables = { category: 'work_categories', tag: 'work_tags' } as const;

function toLabel(row: LabelRow): WorkCategory {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizedDraft(draft: WorkLabelDraft) {
  const name = draft.name.trim();
  if (!name) throw new Error('A name is required.');
  if (name.length > 48) throw new Error('Names can contain at most 48 characters.');
  return { name, color: draft.color };
}

export class TaxonomyRepository {
  async listCategories(options: { archived?: boolean } = {}): Promise<WorkCategory[]> {
    return this.list('category', options);
  }

  async listTags(options: { archived?: boolean } = {}): Promise<WorkTag[]> {
    return this.list('tag', options);
  }

  createCategory(draft: WorkLabelDraft) {
    return this.create('category', draft);
  }

  createTag(draft: WorkLabelDraft) {
    return this.create('tag', draft);
  }

  updateCategory(id: string, draft: WorkLabelDraft) {
    return this.update('category', id, draft);
  }

  updateTag(id: string, draft: WorkLabelDraft) {
    return this.update('tag', id, draft);
  }

  archiveCategory(id: string, archived: boolean) {
    return this.setArchived('category', id, archived);
  }

  archiveTag(id: string, archived: boolean) {
    return this.setArchived('tag', id, archived);
  }

  private async list(kind: Kind, options: { archived?: boolean }) {
    const database = await openDatabase();
    const rows = await database.select<LabelRow[]>(
      `SELECT id, name, color, archived_at, created_at, updated_at
       FROM ${tables[kind]}
       WHERE archived_at IS ${options.archived ? 'NOT NULL' : 'NULL'}
       ORDER BY name COLLATE NOCASE`,
    );
    return rows.map(toLabel);
  }

  private async create(kind: Kind, draft: WorkLabelDraft) {
    const database = await openDatabase();
    const value = normalizedDraft(draft);
    const now = new Date().toISOString();
    const label: WorkCategory = {
      id: crypto.randomUUID(),
      ...value,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await database.execute(
        `INSERT INTO ${tables[kind]} (id, name, color, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)`,
        [label.id, label.name, label.color, now],
      );
    } catch (error) {
      if (String(error).toLowerCase().includes('unique')) {
        throw new Error(`An active ${kind} named “${label.name}” already exists.`);
      }
      throw error;
    }
    return label;
  }

  private async update(kind: Kind, id: string, draft: WorkLabelDraft) {
    const database = await openDatabase();
    const value = normalizedDraft(draft);
    try {
      const result = await database.execute(
        `UPDATE ${tables[kind]} SET name = $1, color = $2, updated_at = $3 WHERE id = $4`,
        [value.name, value.color, new Date().toISOString(), id],
      );
      if (result.rowsAffected !== 1) throw new Error(`This ${kind} no longer exists.`);
    } catch (error) {
      if (String(error).toLowerCase().includes('unique')) {
        throw new Error(`An active ${kind} named “${value.name}” already exists.`);
      }
      throw error;
    }
  }

  private async setArchived(kind: Kind, id: string, archived: boolean) {
    const database = await openDatabase();
    const now = new Date().toISOString();
    await database.execute(
      `UPDATE ${tables[kind]} SET archived_at = $1, updated_at = $2 WHERE id = $3`,
      [archived ? now : null, now, id],
    );
  }
}
