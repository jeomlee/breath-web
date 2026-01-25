// src/navigation/types.ts

export type GroupKey = 'all' | 'focus' | 'rest';

export type DashboardStackParamList = {
  DashboardHome: undefined;
  RoutineCreate: undefined;
};

export type InsightsStackParamList = {
  InsightsHome: undefined;
  RoutineDetail: { routineId: string; title: string; color?: string };
  CalendarScreen: { presetFilter?: GroupKey } | undefined;
};

export type ConnectStackParamList = {
  ConnectHome: undefined;
  ShareRoutineCreate: undefined;
  RoutinePacks: undefined;
  SharedRoutineBoard: { roomId: string; routineTitle?: string };
};

// ✅ 추가
export type MeStackParamList = {
  MeHome: undefined;
  Privacy: undefined;
};

export type RootTabParamList = {
  Dashboard: undefined;
  Focus: undefined;
  Insights: undefined;
  Connect: undefined;
  Me: undefined;
};
