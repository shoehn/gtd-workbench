// Projects list filter, kept in the URL: `/projects?filter=stalled&p=<id>`.

export const PROJECT_FILTERS = ['active', 'work', 'home', 'stalled'] as const;
/** The chips, plus "completed", which shows completed projects instead. */
export type ProjectFilter = (typeof PROJECT_FILTERS)[number] | 'completed';

export function parseProjectFilter(value: string | string[] | undefined): ProjectFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return v === 'completed' || PROJECT_FILTERS.includes(v as (typeof PROJECT_FILTERS)[number]) ? (v as ProjectFilter) : 'active';
}

/** `/projects`, `/projects?filter=home`, `/projects?filter=home&p=p-bench`. */
export function projectsHref(filter: ProjectFilter, projectId?: string): string {
  const q = [filter !== 'active' && `filter=${filter}`, projectId && `p=${encodeURIComponent(projectId)}`].filter(Boolean);
  return q.length ? `/projects?${q.join('&')}` : '/projects';
}
