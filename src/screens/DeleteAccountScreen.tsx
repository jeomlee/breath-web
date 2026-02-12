// src/screens/DeleteAccountScreen.tsx
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text as RNText, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ScreenContainer from '../components/ScreenContainer';
import { supabase } from '../api/supabaseClient';

const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';
const RED = '#FF6B6B';

function T(props: any) {
  return <RNText {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

function Card({ title, desc, children }: any) {
  return (
    <View
      style={{
        backgroundColor: CARD,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: LINE,
        padding: 14,
        marginTop: 12,
      }}
    >
      <T style={{ color: TEXT, fontSize: 15, fontWeight: '900' }}>{title}</T>
      {desc ? <T style={{ color: MUTED, marginTop: 6, lineHeight: 20 }}>{desc}</T> : null}
      <View style={{ marginTop: 12 }}>{children}</View>
    </View>
  );
}

export default function DeleteAccountScreen() {
  const nav = useNavigation<any>();
  const [busy, setBusy] = useState(false);

  const requestDeletion = useCallback(async () => {
    setBusy(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) {
        Alert.alert('안내', '로그인이 필요합니다.');
        return;
      }

      // ✅ 1) “탈퇴 요청” 기록 (운영/자동화용)
      // - 테이블은 너가 만들어야 함: account_deletion_requests(user_id, created_at, status 등)
      // - 없으면 이 insert는 실패할 수 있는데, 그 경우에도 아래 데이터 삭제+로그아웃은 진행 가능하게 처리
      try {
        await supabase.from('account_deletion_requests').insert({
          user_id: user.id,
          status: 'requested',
        });
      } catch (e) {
        // 테이블이 아직 없거나 RLS로 막혀도 사용자 입장에서는 진행되게 둠
        console.log('[deletion request insert skipped]', e);
      }

      // ✅ 2) 사용자 데이터 삭제(앱 내부 데이터)
      // - 앱에 맞게 최소한의 핵심 테이블만 예시로 넣어둠
      // - 너 스키마에 맞춰 추가/수정하면 됨
      // - 실패하더라도 “부분 삭제” 상태가 될 수 있어 경고를 주고 로그아웃은 진행
      const deletes: Array<Promise<any>> = [];
      deletes.push(supabase.from('shared_routine_daily_status').delete().eq('user_id', user.id));
      deletes.push(supabase.from('shared_routine_members').delete().eq('user_id', user.id));
      deletes.push(supabase.from('daily_logs').delete().eq('user_id', user.id));
      deletes.push(supabase.from('routines').delete().eq('user_id', user.id));

      const results = await Promise.allSettled(deletes);
      const failed = results.filter((r) => r.status === 'rejected');

      // ✅ 3) 로그아웃
      await supabase.auth.signOut();

      if (failed.length > 0) {
        Alert.alert(
          '처리 완료',
          '계정 삭제 요청이 접수되었고, 로그아웃되었습니다.\n일부 데이터 정리에 실패했을 수 있습니다. (네트워크/RLS 설정을 확인해 주세요.)'
        );
      } else {
        Alert.alert('처리 완료', '계정 삭제 요청이 접수되었고, 로그아웃되었습니다.');
      }

      nav.goBack();
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '요청을 처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }, [nav]);

  const ask = useCallback(() => {
    Alert.alert(
      '계정 삭제',
      '계정을 삭제하면 기록이 복구되지 않을 수 있습니다.\n계속할까요?',
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제 요청', style: 'destructive', onPress: requestDeletion },
      ]
    );
  }, [requestDeletion]);

  const sub = useMemo(
    () => 'App Store 심사 기준을 위해 “앱 내 계정 삭제 경로”를 제공합니다.\n(완전 삭제는 다음 단계에서 서버 함수로 연결)',
    []
  );

  return (
    <ScreenContainer bg={BG} barStyle="light-content">
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T style={{ color: TEXT, fontSize: 24, fontWeight: '900' }}>계정 삭제</T>
          <Pressable
            onPress={() => nav.goBack()}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: '#0E141C',
              borderWidth: 1,
              borderColor: LINE,
            }}
          >
            <T style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>이전</T>
          </Pressable>
        </View>

        <T style={{ color: MUTED, marginTop: 6, lineHeight: 20 }}>{sub}</T>

        <Card title="삭제 범위" desc="현재 단계에서 제공되는 동작입니다.">
          <T style={{ color: MUTED, lineHeight: 20 }}>
            • 계정 삭제 요청을 접수합니다.{'\n'}
            • 앱 데이터(루틴/기록/공유 참여 정보)를 정리합니다.{'\n'}
            • 즉시 로그아웃됩니다.
          </T>
        </Card>

        <Card title="주의" desc="삭제 요청 후 복구가 어려울 수 있습니다.">
          <Pressable
            onPress={ask}
            disabled={busy}
            style={{
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: 'center',
              backgroundColor: 'rgba(255,107,107,0.10)',
              borderWidth: 1,
              borderColor: 'rgba(255,107,107,0.22)',
              opacity: busy ? 0.7 : 1,
            }}
          >
            <T style={{ color: RED, fontWeight: '900' }}>계정 삭제 요청</T>
          </Pressable>

          {busy ? (
            <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color={RED} />
              <T style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>처리 중입니다…</T>
            </View>
          ) : null}
        </Card>
      </View>
    </ScreenContainer>
  );
}
