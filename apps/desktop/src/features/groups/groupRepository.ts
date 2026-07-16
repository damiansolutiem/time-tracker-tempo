import type { Group, GroupDraft } from '@time-tracker/domain';
import { openDatabase } from '../../infrastructure/database/client';
import { toGroup, type GroupRow } from '../../infrastructure/database/rows';

export class GroupRepository {
  async list(options: { archived?: boolean } = {}): Promise<Group[]> {
    const database = await openDatabase();
    const where = options.archived ? 'archived_at IS NOT NULL' : 'archived_at IS NULL';
    const rows = await database.select<GroupRow[]>(
      `SELECT id, name, description, color, archived_at, created_at, updated_at
       FROM groups WHERE ${where} ORDER BY name COLLATE NOCASE`,
    );
    return rows.map(toGroup);
  }

  async create(draft: GroupDraft): Promise<Group> {
    const name = draft.name.trim();
    if (!name) throw new Error('Group name is required.');
    const database = await openDatabase();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await database.execute(
      `INSERT INTO groups (id, name, description, color, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [id, name, draft.description?.trim() || null, draft.color, now],
    );
    return {
      id,
      name,
      description: draft.description?.trim() || null,
      color: draft.color,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(id: string, draft: GroupDraft): Promise<void> {
    const name = draft.name.trim();
    if (!name) throw new Error('Group name is required.');
    const database = await openDatabase();
    await database.execute(
      `UPDATE groups SET name = $1, description = $2, color = $3, updated_at = $4
       WHERE id = $5`,
      [name, draft.description?.trim() || null, draft.color, new Date().toISOString(), id],
    );
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    const database = await openDatabase();
    const now = new Date().toISOString();
    await database.execute('UPDATE groups SET archived_at = $1, updated_at = $2 WHERE id = $3', [
      archived ? now : null,
      now,
      id,
    ]);
  }
}
