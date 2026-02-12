// src/navigation/insightsHub.ts
import React from 'react';

export type InsightsHubApi = {
  tab: 'insights' | 'calendar';
  goCalendar: () => void;
  goInsights: () => void;
};

const DEFAULT_API: InsightsHubApi = {
  tab: 'insights',
  goCalendar: () => {},
  goInsights: () => {},
};

const Ctx = React.createContext<InsightsHubApi>(DEFAULT_API);

export const InsightsHubProvider = Ctx.Provider;

/** ✅ Provider가 없어도 안전하게 동작 */
export function useInsightsHub(): InsightsHubApi {
  return React.useContext(Ctx);
}
