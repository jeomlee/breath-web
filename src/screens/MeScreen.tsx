// src/screens/MeScreen.tsx
import React, { useCallback, useEffect, useState, memo } from 'react';
import { View, Text, Pressable, Alert, ScrollView, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '../api/supabaseClient';
import ScreenContainer from '../components/ScreenContainer';
import { useNavigation } from '@react-navigation/native';

const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';
const BLUE = '#4CC9FF';

// ✅ logout red
const RED = '#FF6B6B';

const Card = memo(function Card({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text allowFontScaling={false} style={styles.cardTitle}>
        {title}
      </Text>
      {desc ? (
        <Text allowFontScaling={false} style={styles.cardDesc}>
          {desc}
        </Text>
      ) : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
});

const RowButton = memo(function RowButton({
  label,
  sub,
  onPress,
  danger,
  disabled,
}: {
  label: string;
  sub?: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.rowBtn, disabled && { opacity: 0.55 }]} disabled={disabled}>
      <View style={styles.rowBtnLeft}>
        <Text allowFontScaling={false} style={[styles.rowBtnLabel, danger ? styles.danger : null]}>
          {label}
        </Text>
        {sub ? (
          <Text allowFontScaling={false} style={styles.rowBtnSub}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Text allowFontScaling={false} style={styles.rowBtnArrow}>
        ›
      </Text>
    </Pressable>
  );
});

function pickInvokeErrorMessage(e: any) {
  // supabase.functions.invoke error shape가 케이스별로 달라서 최대한 안전하게 뽑음
  const msg =
    e?.message ||
    e?.error?.message ||
    e?.context?.message ||
    (typeof e === 'string' ? e : null);

  if (msg) return String(msg);

  try {
    return JSON.stringify(e);
  } catch {
    return '알 수 없는 오류가 발생했습니다.';
  }
}

export default function MeScreen() {
  const nav = useNavigation<any>();

  const [email, setEmail] = useState<string>('');
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadUser = useCallback(async () => {
    const user = (await supabase.auth.getUser()).data.user;
    setEmail(user?.email ?? '');
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const clearLocalNotificationsOnExit = useCallback(async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {}
    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch {}
  }, []);

  const signOut = useCallback(async () => {
    if (logoutLoading || deleteBusy) return;

    setLogoutLoading(true);
    try {
      await clearLocalNotificationsOnExit();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (e: any) {
      Alert.alert('로그아웃 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLogoutLoading(false);
    }
  }, [clearLocalNotificationsOnExit, deleteBusy, logoutLoading]);

  const onPressLogout = useCallback(() => {
    if (deleteBusy) {
      Alert.alert('안내', '계정 삭제 처리 중에는 로그아웃할 수 없습니다.');
      return;
    }
    Alert.alert('로그아웃', '로그아웃하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: logoutLoading ? '처리 중…' : '로그아웃', style: 'destructive', onPress: signOut },
    ]);
  }, [deleteBusy, logoutLoading, signOut]);

  const goPrivacy = useCallback(() => {
    nav.navigate('Privacy');
  }, [nav]);

  const deleteAccount = useCallback(async () => {
    if (deleteBusy || logoutLoading) return;

    setDeleteBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: { confirm: true },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? '계정 삭제에 실패했습니다.');

      Alert.alert('완료', '계정이 삭제되었습니다.');

      // ✅ 정석: 삭제 후에도 잔재 제거
      await clearLocalNotificationsOnExit();

      await supabase.auth.signOut();
    } catch (e: any) {
      Alert.alert('삭제 실패', pickInvokeErrorMessage(e));
    } finally {
      setDeleteBusy(false);
    }
  }, [clearLocalNotificationsOnExit, deleteBusy, logoutLoading]);

  const requestDeleteAccount = useCallback(() => {
    if (logoutLoading) {
      Alert.alert('안내', '로그아웃 처리 중입니다.');
      return;
    }
    if (deleteBusy) {
      Alert.alert('안내', '계정 삭제 처리 중입니다.');
      return;
    }

    // ✅ Alert는 떠있는 동안 상태 업데이트가 안 되므로(loading 텍스트 교체 불가),
    // 최종 확인은 “고정 텍스트”로 두고, 실제 로딩은 RowButton disabled/서브텍스트로 표현
    Alert.alert(
      '계정 삭제',
      '계정을 삭제하면 저장된 기록이 함께 삭제되며 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '계속',
          style: 'destructive',
          onPress: () => {
            Alert.alert('최종 확인', '정말로 계정을 삭제하시겠습니까?', [
              { text: '취소', style: 'cancel' },
              { text: '삭제', style: 'destructive', onPress: deleteAccount },
            ]);
          },
        },
      ]
    );
  }, [deleteAccount, deleteBusy, logoutLoading]);

  return (
    <ScreenContainer bg={BG} barStyle="light-content">
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
      >
        <View style={styles.header}>
          <Text allowFontScaling={false} style={styles.h1}>
            내 정보
          </Text>
        </View>

        <Card title="프로필" desc="로그인 정보를 확인합니다.">
          <View style={styles.emailRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text allowFontScaling={false} style={styles.emailLabel}>
                이메일
              </Text>
              <Text allowFontScaling={false} style={styles.emailValue} numberOfLines={1} ellipsizeMode="middle">
                {email || '—'}
              </Text>
            </View>

            <Pressable
              onPress={onPressLogout}
              disabled={logoutLoading || deleteBusy}
              style={[styles.logoutBtn, (logoutLoading || deleteBusy) && { opacity: 0.6 }]}
            >
              <Text allowFontScaling={false} style={styles.logoutText}>
                {logoutLoading ? '처리 중…' : deleteBusy ? '잠시만…' : '로그아웃'}
              </Text>
            </Pressable>
          </View>
        </Card>

        <Card title="운영 원칙" desc="강박에서 빠져나오면서도, 꾸준함은 놓치지 않게.">
          <View style={styles.ruleBox}>
            <Text allowFontScaling={false} style={styles.ruleTitle}>
              원칙
            </Text>
            <Text allowFontScaling={false} style={styles.ruleText}>
              • 오늘은 하나면 충분합니다.{'\n'}
              • 멈춤도 과정입니다.{'\n'}
              • 완벽보다 지속을 선택합니다.
            </Text>
          </View>
        </Card>

        <Card title="정책/계정">
          <View style={{ gap: 10 }}>
            <RowButton label="개인정보처리방침" onPress={goPrivacy} disabled={logoutLoading || deleteBusy} />
            <RowButton
              label={deleteBusy ? '계정 삭제 처리 중…' : '계정 삭제'}
              sub={deleteBusy ? '삭제를 진행하고 있습니다. 잠시만 기다려 주세요.' : '요청 → 확인 → 삭제 처리 (복구 불가)'}
              onPress={requestDeleteAccount}
              danger
              disabled={logoutLoading || deleteBusy}
            />
          </View>
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 24,
  },
  header: { marginTop: 0 },
  h1: { color: TEXT, fontSize: 28, fontWeight: '900' },

  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: LINE,
    padding: 14,
    marginTop: 12,
  },
  cardTitle: { color: TEXT, fontSize: 15, fontWeight: '900' },
  cardDesc: { color: MUTED, marginTop: 6, lineHeight: 20 },
  cardBody: { marginTop: 12 },

  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F151D',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  emailLabel: { color: MUTED, fontSize: 12, fontWeight: '900' },
  emailValue: { color: TEXT, marginTop: 6, fontWeight: '900' },

  logoutBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,107,107,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.28)',
  },
  logoutText: { color: RED, fontWeight: '900' },

  rowBtn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#0F151D',
    borderWidth: 1,
    borderColor: LINE,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowBtnLeft: { flex: 1, paddingRight: 10 },
  rowBtnLabel: { color: TEXT, fontWeight: '900' },
  rowBtnSub: { color: MUTED, marginTop: 4, fontSize: 12 },
  rowBtnArrow: { color: MUTED, fontWeight: '900' },
  danger: { color: '#FF6B6B' },

  ruleBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(76,201,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(76,201,255,0.25)',
  },
  ruleTitle: { color: BLUE, fontWeight: '900' },
  ruleText: { color: MUTED, marginTop: 6, lineHeight: 20 },
});
