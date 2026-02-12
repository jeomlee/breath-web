// App.tsx
import 'react-native-gesture-handler';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './src/api/supabaseClient';
import AppNavigator from './src/AppNavigator';
import AuthScreen from './src/screens/AuthScreen';
import { lockFontScaleGlobally } from './src/utils/lockFontScale';

// ✅ 앱 부팅 시 1회: 시스템 폰트 스케일 영향 완전 차단
lockFontScaleGlobally();

const DAILY_HOUR = 21;
const DAILY_MINUTE = 0;
const ANDROID_CHANNEL_ID = 'default';

type ReminderSetting = {
  is_enabled: boolean;
  message: string;
  updated_at?: string | null;
};

/** URL에서 queryParam(code) 추출 */
function extractCodeFromUrl(url: string): string | null {
  try {
    const parsed = Linking.parse(url);
    const code = parsed?.queryParams?.code;
    if (typeof code === 'string' && code.length > 0) return code;

    const m = url.match(/[?&]code=([^&]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
    return null;
  } catch {
    return null;
  }
}

/** URL hash(#...)에서 access_token/refresh_token 추출 */
function extractTokensFromHash(url: string): { access_token?: string; refresh_token?: string } {
  try {
    const hashIndex = url.indexOf('#');
    if (hashIndex === -1) return {};

    const hash = url.slice(hashIndex + 1);
    const params = new URLSearchParams(hash);

    const access_token = params.get('access_token') ?? undefined;
    const refresh_token = params.get('refresh_token') ?? undefined;

    return { access_token, refresh_token };
  } catch {
    return {};
  }
}

async function ensureAndroidChannelOnce() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4CC9FF',
    });
  } catch {}
}

async function clearAllLocalSchedules() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch {}
}

async function scheduleDailyLocal(message: string) {
  // ✅ 기존 스케줄 제거 후 1개만 유지 (정석: 중복 방지)
  await clearAllLocalSchedules();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '브리드',
      body: message,
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: DAILY_HOUR,
      minute: DAILY_MINUTE,
    },
  });
}

async function loadReminderSetting(uid: string): Promise<ReminderSetting> {
  try {
    const { data, error } = await supabase
      .from('reminder_settings')
      .select('is_enabled,message,updated_at')
      .eq('user_id', uid)
      .maybeSingle();

    if (error) return { is_enabled: false, message: '' };

    return {
      is_enabled: !!data?.is_enabled,
      message: (data?.message ?? '') as string,
      updated_at: (data?.updated_at ?? null) as any,
    };
  } catch {
    return { is_enabled: false, message: '' };
  }
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [booted, setBooted] = useState(false);

  // ✅ 중복 동기화 방지(정석): 동일 uid+updated_at+값이면 스킵
  const lastSyncRef = useRef<{
    uid: string;
    updated_at: string | null;
    enabled: boolean;
    msg: string;
  } | null>(null);

  // ✅ 이벤트 폭주 방지(정석): 동기화 작업 직렬화
  const syncBusyRef = useRef<Promise<void> | null>(null);

  // ✅ 앱 전체 알림 핸들러(포그라운드에서도 알림 표시)
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldSetBadge: false,
      }),
    });

    ensureAndroidChannelOnce();
  }, []);

  const syncLocalReminderForSession = useCallback(async (nextSession: any) => {
    // ✅ 직렬화: 이전 sync가 끝난 다음 실행
    const run = async () => {
      const uid: string | undefined = nextSession?.user?.id;
      if (!uid) return;

      const setting = await loadReminderSetting(uid);

      const msg = (setting.message ?? '').trim();
      const key = {
        uid,
        updated_at: setting.updated_at ?? null,
        enabled: !!setting.is_enabled,
        msg,
      };

      const last = lastSyncRef.current;
      if (
        last &&
        last.uid === key.uid &&
        last.updated_at === key.updated_at &&
        last.enabled === key.enabled &&
        last.msg === key.msg
      ) {
        return; // ✅ 같은 설정이면 스킵
      }

      // ✅ 권한은 “요청하지 않음”(정석). 없으면 스케줄을 취소/유지.
      const perm = await Notifications.getPermissionsAsync();
      const granted = perm.status === 'granted';

      try {
        if (!key.enabled || !key.msg) {
          await clearAllLocalSchedules();
        } else {
          // 켜져 있는데 권한이 없으면 스케줄 못 잡으니, 잔재 방지 차원에서 취소
          if (!granted) {
            await clearAllLocalSchedules();
          } else {
            await scheduleDailyLocal(key.msg);
          }
        }
      } finally {
        lastSyncRef.current = key;
      }
    };

    if (!syncBusyRef.current) {
      syncBusyRef.current = run().finally(() => {
        syncBusyRef.current = null;
      });
      return;
    }

    // 이미 실행 중이면 체인으로 연결
    syncBusyRef.current = syncBusyRef.current.then(run).finally(() => {
      syncBusyRef.current = null;
    });
  }, []);

  // ✅ 1) 세션 로드 + onAuthStateChange
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setBooted(true);

      // ✅ 정석: 앱 시작 시(세션 있으면) 즉시 동기화
      if (data.session) {
        syncLocalReminderForSession(data.session);
      } else {
        // 세션 없으면 로컬 잔재 제거(보수적으로)
        clearAllLocalSchedules();
        lastSyncRef.current = null;
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);

      if (event === 'SIGNED_OUT') {
        // ✅ 정석: 로그아웃 시 무조건 잔재 제거
        await clearAllLocalSchedules();
        lastSyncRef.current = null;
        return;
      }

      // ✅ 정석: 로그인/초기세션/토큰갱신 때 현재 계정 설정으로 동기화
      if (newSession && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) {
        await syncLocalReminderForSession(newSession);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [syncLocalReminderForSession]);

  // ✅ 2) OAuth 딥링크 콜백 처리 (code + hash token 모두)
  useEffect(() => {
    let busy = false;

    const handleUrl = async (url: string) => {
      if (!url) return;
      if (busy) return;
      busy = true;

      try {
        const parsed = Linking.parse(url);
        if (parsed?.path !== 'auth/callback') return;

        const code = extractCodeFromUrl(url);
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
          return;
        }

        const { access_token, refresh_token } = extractTokensFromHash(url);
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
          return;
        }
      } finally {
        busy = false;
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    const sub = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    return () => sub.remove();
  }, []);

  if (!booted) return null;

  return (
    <SafeAreaProvider>
      <NavigationContainer>{session ? <AppNavigator /> : <AuthScreen />}</NavigationContainer>
    </SafeAreaProvider>
  );
}
