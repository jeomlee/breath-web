// src/navigation/types.ts

import type { NavigatorScreenParams } from '@react-navigation/native';

export type GroupKey = 'all' | 'focus' | 'rest';

export type DashboardStackParamList = {
  DashboardHome: undefined;
  RoutineCreate: undefined;
};

export type InsightsStackParamList = {
  InsightsHome: undefined;
  RoutineDetail: { routineId: string; title?: string; color?: string };
  CalendarScreen: undefined; // ✅ 추가/정리
};

export type ConnectStackParamList = {
  ConnectHome: undefined;
  ShareRoutineCreate: undefined;
  SharedRoutineBoard: { roomId: string; routineTitle?: string };
};

// ✅ 추가
export type MeStackParamList = {
  MeHome: undefined;
  Privacy: undefined;
};

export type RootTabParamList = {
  Dashboard: NavigatorScreenParams<DashboardStackParamList> | undefined;
  Focus: undefined;
  Insights: NavigatorScreenParams<InsightsStackParamList> | undefined;
  Connect: NavigatorScreenParams<ConnectStackParamList> | undefined;
  Me: NavigatorScreenParams<MeStackParamList> | undefined;
};
