import { KpiConfig } from '../types';

/**
 * Build a province-aware district→branch map from kpiConfigs.
 * Uses composite key "province|district" for accurate matching.
 * Unique districts (only one branch) also get a district-only fallback key.
 */
export function buildDistrictBranchMap(kpiConfigs: KpiConfig[]): Record<string, string> {
  const map: Record<string, string> = {};
  const districtBranches: Record<string, Set<string>> = {};

  kpiConfigs.forEach(k => {
    if (k.branch && k.district) {
      if (k.province) {
        map[`${k.province}|${k.district}`] = k.branch;
      }
      if (!districtBranches[k.district]) districtBranches[k.district] = new Set();
      districtBranches[k.district].add(k.branch);
    }
  });

  // Fallback for unique districts (only one branch owns this district name)
  Object.entries(districtBranches).forEach(([district, branches]) => {
    if (branches.size === 1) {
      map[district] = Array.from(branches)[0];
    }
  });

  return map;
}

/**
 * Look up branch for a delivery record using the province-aware map.
 * Tries composite key first, then falls back to district-only.
 */
export function getDeliveryBranch(
  d: { province?: string; district: string },
  map: Record<string, string>
): string | undefined {
  return map[`${d.province}|${d.district}`] || map[d.district];
}
