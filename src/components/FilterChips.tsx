import type { Client, Project } from '../../shared/api.ts';
import type { LatLng } from '../lib/geo.ts';

export interface FilterChipsProps {
  isFiltered: boolean;
  activeTag: string | null;
  regionPolygon: LatLng[] | null;
  activeClientId: string | null;
  activeProjectId: string | null;
  activeSurveyDate: string | null;
  clients: Client[];
  projects: Project[];
  onClearDate: () => void;
  onClearTag: () => void;
  onClearRegion: () => void;
  onClearClient: () => void;
  onClearProject: () => void;
  onClearSurvey: () => void;
  onClearAll: () => void;
}

// ARCH-02: the active-filters chip row, extracted from App.tsx. Renders nothing
// when no filter is active. Each chip clears its own filter; "Clear all" resets.
export function FilterChips({
  isFiltered,
  activeTag,
  regionPolygon,
  activeClientId,
  activeProjectId,
  activeSurveyDate,
  clients,
  projects,
  onClearDate,
  onClearTag,
  onClearRegion,
  onClearClient,
  onClearProject,
  onClearSurvey,
  onClearAll,
}: FilterChipsProps) {
  const hasAny =
    isFiltered ||
    activeTag ||
    regionPolygon ||
    activeClientId ||
    activeSurveyDate ||
    activeProjectId;
  if (!hasAny) return null;

  return (
    <div className="header-filter-chips-row" style={{ padding: '4px 12px 8px' }}>
      {isFiltered && (
        <button className="filter-chip" onClick={onClearDate}>
          Date range ×
        </button>
      )}
      {activeTag && (
        <button className="filter-chip" onClick={onClearTag}>
          #{activeTag} ×
        </button>
      )}
      {regionPolygon && (
        <button className="filter-chip" onClick={onClearRegion}>
          Region ×
        </button>
      )}
      {activeClientId && (
        <button className="filter-chip" onClick={onClearClient}>
          {clients.find((c) => c.id === activeClientId)?.name ?? 'Client'} ×
        </button>
      )}
      {activeProjectId && (
        <button className="filter-chip" onClick={onClearProject}>
          {projects.find((p) => p.id === activeProjectId)?.name ?? 'Project'} ×
        </button>
      )}
      {activeSurveyDate && (
        <button className="filter-chip" onClick={onClearSurvey}>
          {activeSurveyDate === 'undated'
            ? 'Undated'
            : activeSurveyDate.split('-').reverse().join('/')}{' '}
          ×
        </button>
      )}
      <button className="header-filter-clear" onClick={onClearAll}>
        Clear all
      </button>
    </div>
  );
}
