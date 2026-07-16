import type { Group, Task } from '@time-tracker/domain';
import { describe, expect, it } from 'vitest';
import {
  parseDelimitedTasks,
  parseTaskWorkbook,
  serializeTasksCsv,
  serializeTasksWorkbook,
} from './taskTransfer';

const group: Group = {
  id: 'group-1',
  name: 'Acme',
  description: null,
  color: 'blue',
  archivedAt: null,
  createdAt: '2026-07-15T08:00:00.000Z',
  updatedAt: '2026-07-15T08:00:00.000Z',
};

const task: Task = {
  id: '620c3492-5237-4da0-b8dc-fbf30af9fa4d',
  externalId: 'ACME-104',
  groupId: group.id,
  category: {
    id: 'category-1',
    name: 'Development',
    color: 'blue',
    archivedAt: null,
    createdAt: '2026-07-15T08:00:00.000Z',
    updatedAt: '2026-07-15T08:00:00.000Z',
  },
  tags: [
    {
      id: 'tag-1',
      name: 'Billable',
      color: 'green',
      archivedAt: null,
      createdAt: '2026-07-15T08:00:00.000Z',
      updatedAt: '2026-07-15T08:00:00.000Z',
    },
  ],
  title: '=Website, update',
  description: 'Homepage work',
  color: 'green',
  archivedAt: null,
  createdAt: '2026-07-15T08:00:00.000Z',
  updatedAt: '2026-07-15T08:00:00.000Z',
};

describe('task transfer', () => {
  it('parses pasted tab-separated Excel cells with common group aliases', () => {
    const rows = parseDelimitedTasks(
      'code\ttitle\tclient\tdescription\tcolour\tstatus\nACME-104\tWebsite\tAcme\tHomepage\tblue\tactive',
    );
    expect(rows).toEqual([
      {
        rowNumber: 2,
        externalId: 'ACME-104',
        title: 'Website',
        groupName: 'Acme',
        categoryName: null,
        tagNames: [],
        description: 'Homepage',
        color: 'blue',
        archived: false,
      },
    ]);
  });

  it('writes safe CSV that can be imported again', () => {
    const csv = serializeTasksCsv([task], [group]);
    expect(csv).toContain('"\'=Website, update"');
    expect(parseDelimitedTasks(csv)[0]).toMatchObject({
      externalId: 'ACME-104',
      title: '=Website, update',
      groupName: 'Acme',
      categoryName: 'Development',
      tagNames: ['Billable'],
    });
  });

  it('round-trips task rows through an Excel workbook', async () => {
    const workbook = await serializeTasksWorkbook([task], [group]);
    const rows = await parseTaskWorkbook(workbook);
    expect(rows[0]).toMatchObject({
      externalId: 'ACME-104',
      title: '=Website, update',
      groupName: 'Acme',
      categoryName: 'Development',
      tagNames: ['Billable'],
    });
  });
});
