import { openDatabase } from '../../infrastructure/database/client';

export interface WorkCheckRepository {
  schedule(entryId: string, deadline: string, updatedAt: string): Promise<boolean>;
  markPending(entryId: string, updatedAt: string): Promise<boolean>;
  confirm(entryId: string, confirmedAt: string, nextDeadline: string): Promise<boolean>;
  expire(entryId: string, deadline: string, reconciledAt: string): Promise<boolean>;
  clear(entryId: string, updatedAt: string): Promise<boolean>;
}

export class SqliteWorkCheckRepository implements WorkCheckRepository {
  async schedule(entryId: string, deadline: string, updatedAt: string) {
    const database = await openDatabase();
    const result = await database.execute(
      `UPDATE time_entries SET check_due_at = $1, verification_state = 'confirmed', updated_at = $2
       WHERE id = $3 AND ended_at IS NULL`,
      [deadline, updatedAt, entryId],
    );
    return result.rowsAffected === 1;
  }

  async markPending(entryId: string, updatedAt: string) {
    const database = await openDatabase();
    const result = await database.execute(
      `UPDATE time_entries SET verification_state = 'pending', updated_at = $1
       WHERE id = $2 AND ended_at IS NULL AND verification_state = 'confirmed'
         AND check_due_at IS NOT NULL AND check_due_at <= $1`,
      [updatedAt, entryId],
    );
    return result.rowsAffected === 1;
  }

  async confirm(entryId: string, confirmedAt: string, nextDeadline: string) {
    const database = await openDatabase();
    const result = await database.execute(
      `UPDATE time_entries SET confirmed_at = $1, check_due_at = $2,
         verification_state = 'confirmed', updated_at = $1
       WHERE id = $3 AND ended_at IS NULL AND verification_state = 'pending'`,
      [confirmedAt, nextDeadline, entryId],
    );
    return result.rowsAffected === 1;
  }

  async expire(entryId: string, deadline: string, reconciledAt: string) {
    const database = await openDatabase();
    const result = await database.execute(
      `UPDATE time_entries SET ended_at = $1, check_due_at = NULL,
         verification_state = 'confirmed', updated_at = $2
       WHERE id = $3 AND ended_at IS NULL AND verification_state = 'pending'
         AND check_due_at = $1`,
      [deadline, reconciledAt, entryId],
    );
    return result.rowsAffected === 1;
  }

  async clear(entryId: string, updatedAt: string) {
    const database = await openDatabase();
    const result = await database.execute(
      `UPDATE time_entries SET check_due_at = NULL, verification_state = 'confirmed', updated_at = $1
       WHERE id = $2 AND ended_at IS NULL`,
      [updatedAt, entryId],
    );
    return result.rowsAffected === 1;
  }
}
