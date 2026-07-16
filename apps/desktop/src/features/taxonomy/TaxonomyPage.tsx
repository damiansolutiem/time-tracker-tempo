import type { WorkCategory, WorkTag } from '@time-tracker/domain';
import type { appStore } from '../../app/store';
import { TaxonomySettings } from '../settings/TaxonomySettings';

type Props = {
  categories: WorkCategory[];
  archivedCategories: WorkCategory[];
  tags: WorkTag[];
  archivedTags: WorkTag[];
  actions: typeof appStore;
};

export function TaxonomyPage({
  categories,
  archivedCategories,
  tags,
  archivedTags,
  actions,
}: Props) {
  return (
    <div className="mx-auto w-full max-w-5xl px-10 py-9">
      <h1 className="m-0 text-3xl font-semibold tracking-tight">Categories and tags</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-surface-muted-foreground">
        Organize task defaults and reporting labels in one place. Tempo copies these assignments to
        each new time entry, so changing a task later does not rewrite historical reports.
      </p>
      <TaxonomySettings
        categories={categories}
        archivedCategories={archivedCategories}
        tags={tags}
        archivedTags={archivedTags}
        actions={actions}
      />
    </div>
  );
}
