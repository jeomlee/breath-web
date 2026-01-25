// src/AppNavigator.tsx
import React, { useMemo } from 'react';
import { View, Platform, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  DashboardStackParamList,
  InsightsStackParamList,
  ConnectStackParamList,
  RootTabParamList,
  MeStackParamList, // ✅ 추가
} from './navigation/types';

import { InsightsHubProvider, type InsightsHubApi } from './navigation/insightsHub';

// Screens
import DashboardScreen from './screens/DashboardScreen';
import RoutineCreateScreen from './screens/RoutineCreateScreen';
import FocusScreen from './screens/FocusScreen';

import InsightsScreen from './screens/InsightsScreen';
import RoutineDetailScreen from './screens/RoutineDetailScreen';
import CalendarScreen from './screens/CalendarScreen';

import MeScreen from './screens/MeScreen';
import PrivacyScreen from './screens/PrivacyScreen'; // ✅ 추가

// Connect
import ConnectSharedScreen from './screens/ConnectSharedScreen';
import ShareRoutineCreateScreen from './screens/ShareRoutineCreateScreen';
import SharedRoutineBoardScreen from './screens/SharedRoutineBoardScreen';
import RoutinePacksScreen from './screens/RoutinePacksScreen';

/* -----------------------
   Navigators
------------------------ */

const Tab = createBottomTabNavigator<RootTabParamList>();
const DashStack = createNativeStackNavigator<DashboardStackParamList>();
const InsStack = createNativeStackNavigator<InsightsStackParamList>();
const ConnectStackNav = createNativeStackNavigator<ConnectStackParamList>();
const MeStackNav = createNativeStackNavigator<MeStackParamList>(); // ✅ 추가

const BG = '#0B0F14';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const BLUE = '#4CC9FF';

/* -----------------------
   Stacks
------------------------ */

function DashboardStack() {
  return (
    <DashStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: BG } }}>
      <DashStack.Screen name="DashboardHome" component={DashboardScreen} />
      <DashStack.Screen name="RoutineCreate" component={RoutineCreateScreen} />
    </DashStack.Navigator>
  );
}

function InsightsStack() {
  return (
    <InsStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: BG } }}>
      <InsStack.Screen name="InsightsHome" component={InsightsScreen} />
      <InsStack.Screen name="RoutineDetail" component={RoutineDetailScreen} />
      <InsStack.Screen name="CalendarScreen" component={CalendarScreen as any} />
    </InsStack.Navigator>
  );
}

function InsightsCalendarHub() {
  const api = useMemo<InsightsHubApi>(
    () => ({ tab: 'insights', goCalendar: () => {}, goInsights: () => {} }),
    []
  );

  return (
    <InsightsHubProvider value={api}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <InsightsStack />
      </View>
    </InsightsHubProvider>
  );
}

function ConnectHub() {
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ConnectSharedScreen />
    </View>
  );
}

function ConnectStack() {
  return (
    <ConnectStackNav.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: BG } }}>
      <ConnectStackNav.Screen name="ConnectHome" component={ConnectHub} />
      <ConnectStackNav.Screen name="ShareRoutineCreate" component={ShareRoutineCreateScreen} />
      <ConnectStackNav.Screen name="SharedRoutineBoard" component={SharedRoutineBoardScreen} />
      <ConnectStackNav.Screen name="RoutinePacks" component={RoutinePacksScreen as any} />
    </ConnectStackNav.Navigator>
  );
}

// ✅ Me 탭도 스택으로 (Privacy 내부 페이지 라우팅 가능)
function MeStack() {
  return (
    <MeStackNav.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: BG } }}>
      <MeStackNav.Screen name="MeHome" component={MeScreen} />
      <MeStackNav.Screen name="Privacy" component={PrivacyScreen} />
    </MeStackNav.Navigator>
  );
}

/* -----------------------
   Tab Icon
------------------------ */

function tabIcon(name: keyof typeof Ionicons.glyphMap, color: string) {
  return <Ionicons name={name} size={20} color={color} />;
}

/* -----------------------
   App Navigator
------------------------ */

export default function AppNavigator() {
  const insets = useSafeAreaInsets();

  const BASE_HEIGHT_IOS = 62;
  const BASE_HEIGHT_ANDROID = 56;

  const baseHeight = Platform.OS === 'ios' ? BASE_HEIGHT_IOS : BASE_HEIGHT_ANDROID;
  const bottomInset = Math.max(insets.bottom, 0);
  const minBottomPad = Platform.OS === 'ios' ? 18 : 10;

  const paddingBottom = Math.max(bottomInset, minBottomPad);
  const height = baseHeight + paddingBottom;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: BG,
          borderTopColor: LINE,
          borderTopWidth: 1,
          height,
          paddingTop: 8,
          paddingBottom,
        },
        tabBarActiveTintColor: BLUE,
        tabBarInactiveTintColor: MUTED,

        tabBarLabel: ({ color }) => (
          <Text
            allowFontScaling={false}
            style={{
              color,
              fontSize: 11,
              fontWeight: '900',
              marginTop: 4,
            }}
          >
            {route.name}
          </Text>
        ),

        tabBarIcon: ({ color, focused }) => {
          const key = route.name;
          if (key === 'Dashboard') return tabIcon(focused ? 'home' : 'home-outline', color);
          if (key === 'Focus') return tabIcon(focused ? 'timer' : 'timer-outline', color);
          if (key === 'Insights') return tabIcon(focused ? 'grid' : 'grid-outline', color);
          if (key === 'Connect') return tabIcon(focused ? 'people' : 'people-outline', color);
          if (key === 'Me') return tabIcon(focused ? 'person' : 'person-outline', color);
          return tabIcon('ellipse', color);
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardStack} />
      <Tab.Screen name="Focus" component={FocusScreen} />
      <Tab.Screen name="Insights" component={InsightsCalendarHub} />
      <Tab.Screen name="Connect" component={ConnectStack} />
      <Tab.Screen name="Me" component={MeStack} />
    </Tab.Navigator>
  );
}
