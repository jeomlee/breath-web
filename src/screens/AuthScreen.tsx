// src/screens/AuthScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text as RNText,
  TextInput,
  Pressable,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  type TextProps,
  Keyboard,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { supabase } from '../api/supabaseClient';
import ScreenContainer from '../components/ScreenContainer';

// ✅ iOS에서 ASWebAuthenticationSession 완료 처리에 필요
WebBrowser.maybeCompleteAuthSession();

function T(props: TextProps) {
  return <RNText {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

const COLORS = {
  BG: '#0B0F14',
  SURFACE: '#0E141C',
  LINE: '#1E2A38',
  TEXT: '#EAF2FF',
  MUTED: '#8FA3B8',
  BLUE: '#4CC9FF',
  BLUE_BG: 'rgba(76,201,255,0.14)',
  BLUE_LINE: 'rgba(76,201,255,0.35)',
  GREEN: '#3BE7B0',
  GREEN_BG: 'rgba(59,231,176,0.14)',
  GREEN_LINE: 'rgba(59,231,176,0.35)',
  GRAY_BG: 'rgba(107,127,150,0.12)',
  GRAY_LINE: 'rgba(107,127,150,0.28)',
};

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** URL hash(#...)에서 access_token/refresh_token 추출 */
function extractTokensFromHash(url: string): { access_token?: string; refresh_token?: string } {
  try {
    const hashIndex = url.indexOf('#');
    if (hashIndex === -1) return {};
    const hash = url.slice(hashIndex + 1);
    const params = new URLSearchParams(hash);
    return {
      access_token: params.get('access_token') ?? undefined,
      refresh_token: params.get('refresh_token') ?? undefined,
    };
  } catch {
    return {};
  }
}

/** URL query(?...)에서 code 추출 (혹시 code flow로 올 때 대비) */
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

// ✅ 너 Vercel 브릿지 도메인
const OAUTH_BRIDGE_BASE = 'https://breath-oauth-bridge.vercel.app';
// ✅ Supabase OAuth redirectTo는 브릿지의 callback로 고정(출시 모델용)
const WEB_REDIRECT_TO = `${OAUTH_BRIDGE_BASE}/auth/callback`;

// ✅ 앱이 받을 returnUrl (openAuthSessionAsync가 성공시 이 URL을 result.url로 돌려줌)
const APP_DEEPLINK = 'breath://auth/callback';

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [emailOpen, setEmailOpen] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);

  const withLoading = async (fn: () => Promise<void>) => {
    if (loading) return;
    setLoading(true);
    try {
      await fn();
    } finally {
      setLoading(false);
    }
  };

  /**
   * ✅ 핵심:
   * - signInWithOAuth로 URL 얻고
   * - WebBrowser.openAuthSessionAsync로 "브라우저 세션" 실행
   * - 성공 시 result.url (breath://auth/callback#...)을 즉시 파싱해서 setSession/exchange
   *
   * => App.tsx Linking 이벤트에 의존 안 함 (지금 너 환경에서 이게 정답)
   */
  const signInWithGoogle = async () => {
    Keyboard.dismiss();

    await withLoading(async () => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: WEB_REDIRECT_TO,
          // ✅ (중요) 모바일에서는 우리가 직접 브라우저를 열 거라 자동 리다이렉트 방지
          skipBrowserRedirect: true,
        },
      });

      if (error) return Alert.alert('로그인 실패', error.message);
      if (!data?.url) return Alert.alert('로그인 실패', '인증 URL을 가져오지 못했습니다.');

      console.log('OAUTH_URL =>', data.url);

      // ✅ 어떤 브라우저든(환경별 기본 인증 세션) 안정적으로 동작하도록 openAuthSessionAsync 사용
      const result = await WebBrowser.openAuthSessionAsync(data.url, APP_DEEPLINK);
      console.log('[openAuthSessionAsync]', result);

      if (result.type !== 'success' || !result.url) {
        // cancel / dismiss 등
        return;
      }

      // 1) code flow (혹시 code로 올 때)
      const code = extractCodeFromUrl(result.url);
      if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exErr) {
          console.log('[exchangeCodeForSession error]', exErr);
          return Alert.alert('로그인 실패', exErr.message);
        }
        return;
      }

      // 2) token hash flow (#access_token=...)
      const { access_token, refresh_token } = extractTokensFromHash(result.url);
      if (access_token && refresh_token) {
        const { error: setErr } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (setErr) {
          console.log('[setSession error]', setErr);
          return Alert.alert('로그인 실패', setErr.message);
        }
        return;
      }

      console.log('[Auth] No code/tokens in return url');
      Alert.alert('로그인 실패', '콜백 URL에서 인증 정보를 찾지 못했습니다.');
    });
  };

const signInWithApple = async () => {
  Keyboard.dismiss();

  await withLoading(async () => {
    if (Platform.OS !== 'ios') return;

    // ✅ 1) 기기 지원 여부 먼저 체크
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      Alert.alert('로그인 실패', '이 기기에서는 Apple 로그인을 사용할 수 없습니다.');
      return;
    }

    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      // 사용자가 취소한 경우도 여기로 들어올 수 있음
      if (!cred?.identityToken) {
        Alert.alert('로그인 실패', 'Apple identityToken을 가져오지 못했습니다.');
        return;
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: cred.identityToken,
      });

      if (error) {
        Alert.alert('로그인 실패', error.message);
        return;
      }
    } catch (e: any) {
      // ✅ 2) 여기서 무조건 원인 노출
      const msg = e?.message ?? String(e);
      console.log('[AppleLoginError]', e);
      Alert.alert('로그인 실패', msg);
    }
  });
};


  const signInWithEmail = async () => {
    Keyboard.dismiss();
    await withLoading(async () => {
      const e = email.trim();
      if (!isValidEmail(e)) return Alert.alert('확인 필요', '이메일 형식을 확인해 주세요.');
      if (password.length < 6) return Alert.alert('확인 필요', '비밀번호는 6자 이상이어야 합니다.');

      const { error } = await supabase.auth.signInWithPassword({ email: e, password });
      if (error) return Alert.alert('로그인 실패', error.message);
    });
  };

  const signUpWithEmail = async () => {
    Keyboard.dismiss();
    await withLoading(async () => {
      const e = email.trim();
      if (!isValidEmail(e)) return Alert.alert('확인 필요', '이메일 형식을 확인해 주세요.');
      if (password.length < 6) return Alert.alert('확인 필요', '비밀번호는 6자 이상이어야 합니다.');

      const { error } = await supabase.auth.signUp({
        email: e,
        password,
        options: { emailRedirectTo: WEB_REDIRECT_TO },
      });

      if (error) return Alert.alert('가입 실패', error.message);

      Alert.alert('가입 완료', '메일함에서 인증을 완료한 뒤 로그인해 주세요.');
      setMode('login');
    });
  };

  const Btn = ({
    label,
    onPress,
    tone,
    icon,
  }: {
    label: string;
    onPress: () => void;
    tone: 'blue' | 'green' | 'neutral';
    icon: React.ReactNode;
  }) => {
    const bg =
      tone === 'blue' ? COLORS.BLUE_BG : tone === 'green' ? COLORS.GREEN_BG : COLORS.GRAY_BG;
    const border =
      tone === 'blue' ? COLORS.BLUE_LINE : tone === 'green' ? COLORS.GREEN_LINE : COLORS.GRAY_LINE;
    const text = tone === 'blue' ? COLORS.BLUE : tone === 'green' ? COLORS.GREEN : COLORS.TEXT;

    return (
      <Pressable
        onPress={onPress}
        disabled={loading}
        style={({ pressed }) => ({
          width: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingVertical: 14,
          borderRadius: 18,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
          opacity: loading ? 0.6 : pressed ? 0.88 : 1,
        })}
      >
        {icon}
        <T style={{ color: text, fontWeight: '900' }}>{label}</T>
      </Pressable>
    );
  };

  const Field = ({
    placeholder,
    value,
    onChangeText,
    secureTextEntry,
    keyboardType,
    autoCapitalize,
  }: {
    placeholder: string;
    value: string;
    onChangeText: (v: string) => void;
    secureTextEntry?: boolean;
    keyboardType?: any;
    autoCapitalize?: any;
  }) => {
    return (
      <View
        style={{
          width: '100%',
          borderWidth: 1,
          borderColor: COLORS.LINE,
          backgroundColor: COLORS.SURFACE,
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#556477"
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          style={{ color: COLORS.TEXT, fontWeight: '800' }}
        />
      </View>
    );
  };

  return (
    <ScreenContainer bg={COLORS.BG} barStyle="light-content">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 18,
            paddingVertical: 24,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: COLORS.LINE,
                backgroundColor: COLORS.SURFACE,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: COLORS.BLUE,
                  position: 'absolute',
                  top: 16,
                  left: 18,
                  opacity: 0.9,
                }}
              />
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: COLORS.GREEN,
                  position: 'absolute',
                  bottom: 14,
                  right: 16,
                  opacity: 0.9,
                }}
              />
              <Ionicons name="leaf-outline" size={22} color={COLORS.TEXT} />
            </View>

            <T style={{ color: COLORS.TEXT, fontSize: 28, fontWeight: '900', marginTop: 14 }}>
              BREATH
            </T>
            <T style={{ color: COLORS.MUTED, marginTop: 6 }}>멈춰도 괜찮은 꾸준함</T>

            <T
              style={{
                color: COLORS.MUTED,
                marginTop: 12,
                fontSize: 12,
                lineHeight: 18,
                textAlign: 'center',
              }}
            >
              오늘을 ‘완료’로 만들지 않아도 돼요.
              {'\n'}
              시작한 것만으로도 충분합니다.
            </T>
          </View>

          <View style={{ width: '100%', marginTop: 18, gap: 10 }}>
            <Btn
              label="Google로 계속"
              onPress={signInWithGoogle}
              tone="blue"
              icon={<Ionicons name="logo-google" size={18} color={COLORS.BLUE} />}
            />

            {Platform.OS === 'ios' ? (
              <Btn
                label="Apple로 계속"
                onPress={signInWithApple}
                tone="neutral"
                icon={<Ionicons name="logo-apple" size={20} color={COLORS.TEXT} />}
              />
            ) : null}

            <Pressable
              onPress={() => setEmailOpen((v) => !v)}
              disabled={loading}
              style={({ pressed }) => ({
                width: '100%',
                paddingVertical: 14,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.LINE,
                backgroundColor: COLORS.SURFACE,
                opacity: loading ? 0.6 : pressed ? 0.9 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              })}
            >
              <Ionicons name="mail-outline" size={18} color={COLORS.GREEN} />
              <T style={{ color: COLORS.TEXT, fontWeight: '900' }}>이메일로 계속</T>
              <Ionicons
                name={emailOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.MUTED}
                style={{ position: 'absolute', right: 14 }}
              />
            </Pressable>

            {emailOpen ? (
              <View style={{ width: '100%', gap: 10, marginTop: 6 }}>
                <Field
                  placeholder="이메일"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Field
                  placeholder="비밀번호 (6자 이상)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />

                {mode === 'login' ? (
                  <Btn
                    label="로그인"
                    onPress={signInWithEmail}
                    tone="green"
                    icon={<Ionicons name="log-in-outline" size={18} color={COLORS.GREEN} />}
                  />
                ) : (
                  <Btn
                    label="가입하기"
                    onPress={signUpWithEmail}
                    tone="green"
                    icon={<Ionicons name="person-add-outline" size={18} color={COLORS.GREEN} />}
                  />
                )}

                <Pressable
                  onPress={() => setMode((m) => (m === 'login' ? 'signup' : 'login'))}
                  disabled={loading}
                  style={({ pressed }) => ({
                    width: '100%',
                    paddingVertical: 12,
                    borderRadius: 18,
                    alignItems: 'center',
                    opacity: loading ? 0.6 : pressed ? 0.9 : 1,
                  })}
                >
                  <T style={{ color: COLORS.MUTED, fontWeight: '900' }}>
                    {mode === 'login' ? '처음이신가요? 이메일로 가입하기' : '이미 계정이 있나요? 로그인으로'}
                  </T>
                </Pressable>
              </View>
            ) : null}

            {loading ? (
              <View style={{ alignItems: 'center', marginTop: 6 }}>
                <ActivityIndicator />
                <T style={{ color: COLORS.MUTED, marginTop: 8, fontSize: 12 }}>잠시만요…</T>
              </View>
            ) : null}
          </View>

          <View style={{ marginTop: 14, width: '100%' }}>
            <T style={{ color: COLORS.MUTED, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
              계속 진행하면 서비스 이용약관 및 개인정보처리방침에 동의한 것으로 간주됩니다.
            </T>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
