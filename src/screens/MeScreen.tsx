// src/screens/MeScreen.tsx
import React, { useCallback, useEffect, useMemo, useState, memo } from 'react';
import { View, Text, Pressable, Alert, ScrollView, TextInput, StyleSheet } from 'react-native';
import { supabase } from '../api/supabaseClient';
import ScreenContainer from '../components/ScreenContainer';
import { useNavigation } from '@react-navigation/native';

const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';
const BLUE = '#4CC9FF';
const GREEN = '#3BE7B0';

// ✅ logout red
const RED = '#FF6B6B';

const NICK_MIN = 1;
const NICK_MAX = 7;

const H = 46;

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
}: {
  label: string;
  sub?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.rowBtn}>
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

export default function MeScreen() {
  const nav = useNavigation<any>();

  const [email, setEmail] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const [uid, setUid] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string>('');
  const [nickLoading, setNickLoading] = useState(false);
  const [nickSaving, setNickSaving] = useState(false);

  const nicknameTrim = useMemo(() => nickname.trim(), [nickname]);

  const loadUser = useCallback(async () => {
    const user = (await supabase.auth.getUser()).data.user;
    setEmail(user?.email ?? '');
    setUid(user?.id ?? null);

    if (!user?.id) return;

    setNickLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error) setNickname((data?.nickname ?? '').toString());
    } catch {
      // ignore
    } finally {
      setNickLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const signOut = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);
    if (error) Alert.alert('로그아웃 실패', error.message);
  }, []);

  const onPressLogout = useCallback(() => {
    Alert.alert('로그아웃', '로그아웃하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: signOut },
    ]);
  }, [signOut]);

  const onChangeNickname = useCallback((t: string) => {
    if (t.length <= NICK_MAX) setNickname(t);
    else setNickname(t.slice(0, NICK_MAX));
  }, []);

  const saveNickname = useCallback(async () => {
    if (!uid) return Alert.alert('안내', '로그인이 필요합니다.');

    const nn = nicknameTrim;

    if (nn.length < NICK_MIN) return Alert.alert('안내', `닉네임을 ${NICK_MIN}자 이상 입력해 주세요.`);
    if (nn.length > NICK_MAX) return Alert.alert('안내', `닉네임은 ${NICK_MAX}자 이하로 입력해 주세요.`);

    setNickSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert(
          {
            user_id: uid,
            nickname: nn,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      Alert.alert('완료', '닉네임이 저장되었습니다.');
      await loadUser();
    } catch (e: any) {
      Alert.alert('저장 실패', e?.message ?? '닉네임 저장에 실패했습니다.');
    } finally {
      setNickSaving(false);
    }
  }, [uid, nicknameTrim, loadUser]);

  const goPrivacy = useCallback(() => {
    nav.navigate('Privacy');
  }, [nav]);

  const deleteAccount = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: { confirm: true },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? '계정 삭제에 실패했습니다.');

      Alert.alert('완료', '계정이 삭제되었습니다.');
      await supabase.auth.signOut();
    } catch (e: any) {
      Alert.alert('삭제 실패', e?.message ?? '계정 삭제에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const requestDeleteAccount = useCallback(() => {
    Alert.alert(
      '계정 삭제 요청',
      '계정을 삭제하면 저장된 기록이 함께 삭제되며 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '계속',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              '최종 확인',
              '정말로 계정을 삭제하시겠습니까?',
              [
                { text: '취소', style: 'cancel' },
                { text: loading ? '처리 중…' : '삭제', style: 'destructive', onPress: deleteAccount },
              ]
            );
          },
        },
      ]
    );
  }, [deleteAccount, loading]);

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

        <Card title="프로필" desc="로그인 정보와 닉네임을 관리합니다.">
          {/* 이메일 + 로그아웃 */}
          <View style={styles.emailRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text allowFontScaling={false} style={styles.emailLabel}>
                이메일
              </Text>
              <Text allowFontScaling={false} style={styles.emailValue}>
                {email || '—'}
              </Text>
            </View>

            <Pressable
              onPress={onPressLogout}
              disabled={loading}
              style={[styles.logoutBtn, loading && { opacity: 0.6 }]}
            >
              <Text allowFontScaling={false} style={styles.logoutText}>
                {loading ? '처리 중…' : '로그아웃'}
              </Text>
            </Pressable>
          </View>

          {/* ✅ 닉네임 제목 옆에 "붙어서" 표시 */}
          <View style={styles.nickTitleRow}>
            <Text allowFontScaling={false} style={styles.nickTitle}>
              닉네임
            </Text>

            <Text
              allowFontScaling={false}
              style={styles.nickTitleValue}
              numberOfLines={1}
            >
              {nickLoading ? '불러오는 중…' : nicknameTrim || '미설정'}
            </Text>
          </View>

          <View style={styles.nickRow}>
            <View style={styles.nickInputWrap}>
              <TextInput
                value={nickname}
                onChangeText={onChangeNickname}
                placeholder="닉네임을 입력해 주세요"
                placeholderTextColor="rgba(143,163,184,0.55)"
                maxLength={NICK_MAX}
                returnKeyType="done"
                onSubmitEditing={saveNickname}
                allowFontScaling={false}
                style={styles.nickInput}
              />
            </View>

            <Pressable
              onPress={saveNickname}
              disabled={nickSaving || nickLoading}
              style={[styles.nickSaveBtn, (nickSaving || nickLoading) && { opacity: 0.6 }]}
            >
              <Text allowFontScaling={false} style={styles.nickSaveText}>
                {nickSaving ? '저장 중…' : '저장'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.nickMetaRow}>
            <Text allowFontScaling={false} style={styles.nickMeta}>
              * {NICK_MIN}~{NICK_MAX}자
            </Text>
            <Text allowFontScaling={false} style={styles.nickMeta}>
              {nicknameTrim.length}/{NICK_MAX}
            </Text>
          </View>
        </Card>

        <Card title="운영 원칙" desc="강박에서 빠져나오면서도, 꾸준함은 놓치지 않게.">
          <View style={styles.ruleBox}>
            <Text allowFontScaling={false} style={styles.ruleTitle}>
              원칙
            </Text>
            <Text allowFontScaling={false} style={styles.ruleText}>
              • 오늘은 1개면 충분합니다.{'\n'}
              • “쉬기”도 기록입니다.{'\n'}
              • 많이가 아니라, 계속입니다.
            </Text>
          </View>
        </Card>

        <Card title="정책/계정" desc="심사/운영을 위한 항목입니다.">
          <View style={{ gap: 10 }}>
            <RowButton label="개인정보처리방침" sub="앱 내에서 확인합니다." onPress={goPrivacy} />
            <RowButton
              label="계정 삭제"
              sub="요청 → 확인 → 삭제 처리 (복구 불가)"
              onPress={requestDeleteAccount}
              danger
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

  // ✅ red logout
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

  // ✅ 붙여서 보이게: space-between 제거 + gap
  nickTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 14,
    gap: 8,
  },
  nickTitle: { color: MUTED, fontSize: 12, fontWeight: '900' },
  nickTitleValue: { color: TEXT, fontSize: 14, fontWeight: '900', flexShrink: 1 },

  nickRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 10 },
  nickInputWrap: {
    flex: 1,
    backgroundColor: '#0F151D',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 14,
    height: H,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  nickInput: { color: TEXT, fontWeight: '900', paddingVertical: 0 },
  nickSaveBtn: {
    height: H,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59,231,176,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(59,231,176,0.26)',
  },
  nickSaveText: { color: GREEN, fontWeight: '900' },

  nickMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  nickMeta: { color: MUTED, fontSize: 12, fontWeight: '900' },

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
