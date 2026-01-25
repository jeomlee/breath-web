// App.tsx
import 'react-native-gesture-handler';

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';

import { supabase } from './src/api/supabaseClient';
import AppNavigator from './src/AppNavigator';
import AuthScreen from './src/screens/AuthScreen';
import { lockFontScaleGlobally } from './src/utils/lockFontScale';

// ✅ 앱 부팅 시 1회: 시스템 폰트 스케일 영향 완전 차단
lockFontScaleGlobally();

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

    const hash = url.slice(hashIndex + 1); // access_token=...&refresh_token=...
    const params = new URLSearchParams(hash);

    const access_token = params.get('access_token') ?? undefined;
    const refresh_token = params.get('refresh_token') ?? undefined;

    return { access_token, refresh_token };
  } catch {
    return {};
  }
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [booted, setBooted] = useState(false);

  // ✅ 1) 세션 로드 + onAuthStateChange
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setBooted(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // ✅ 2) OAuth 딥링크 콜백 처리 (code + hash token 모두)
  useEffect(() => {
    let busy = false;

    const handleUrl = async (url: string) => {
      if (!url) return;
      if (busy) return; // 중복 방지
      busy = true;

      try {
        console.log('[DEEPLINK]', url);

        const parsed = Linking.parse(url);
        if (parsed?.path !== 'auth/callback') return;

        // 1) Authorization Code Flow (code=)
        const code = extractCodeFromUrl(url);
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) console.log('[exchangeCodeForSession error]', error);
          return;
        }

        // 2) Implicit Flow / Token in hash (#access_token=...)
        const { access_token, refresh_token } = extractTokensFromHash(url);
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (error) console.log('[setSession error]', error);
          return;
        }

        console.log('[DEEPLINK] no code / no tokens found');
      } finally {
        busy = false;
      }
    };

    // 앱이 꺼진 상태에서 딥링크로 켜진 경우
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    // 앱이 켜져있는 상태에서 딥링크 들어오는 경우
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
