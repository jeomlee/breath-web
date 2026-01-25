// src/navigation/insightsHub.tsx
import React, { createContext, useContext } from 'react';
import type { GroupKey } from './types';

export type InsightsHubApi = {
  tab: 'insights' | 'calendar';
  goCalendar: (presetFilter?: GroupKey) => void;
  goInsights: () => void;
};

const InsightsHubContext = createContext<InsightsHubApi | null>(null);

export function InsightsHubProvider({
  value,
  children,
}: {
  value: InsightsHubApi;
  children: React.ReactNode;
}) {
  return <InsightsHubContext.Provider value={value}>{children}</InsightsHubContext.Provider>;
}

export function useInsightsHub() {
  return useContext(InsightsHubContext);
}
