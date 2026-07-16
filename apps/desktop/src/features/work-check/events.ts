import type { Task } from '@time-tracker/domain';

export const WORK_CHECK_READY = 'tempo://work-check-ready';
export const WORK_CHECK_STATE = 'tempo://work-check-state';
export const WORK_CHECK_ACTION = 'tempo://work-check-action';

export type WorkCheckWindowState = {
  entryId: string;
  taskTitle: string;
  startedAt: string;
  deadline: string;
  graceEndsAt: string;
  reason: 'interval' | 'recovery';
  tasks: (Pick<Task, 'id' | 'externalId' | 'title'> & { groupName: string | null })[];
};

export type WorkCheckAction =
  | { type: 'confirm'; entryId: string }
  | { type: 'stop'; entryId: string }
  | { type: 'switch'; entryId: string; taskId: string };
