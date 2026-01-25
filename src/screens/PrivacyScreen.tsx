// src/screens/PrivacyScreen.tsx
import React, { useMemo } from 'react';
import { View, ScrollView, Pressable, Text as RNText } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import ScreenContainer from '../components/ScreenContainer';

const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';

function T(props: any) {
  return <RNText {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();

  const topPad = useMemo(() => Math.max(insets.top + 6, 10), [insets.top]);

  return (
    <ScreenContainer bg={BG} barStyle="light-content">
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad,
          paddingHorizontal: 16,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => (nav.canGoBack?.() ? nav.goBack() : nav.navigate('MeHome'))}
            hitSlop={10}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: '#0F151D',
              borderWidth: 1,
              borderColor: LINE,
            }}
          >
            <T style={{ color: MUTED, fontWeight: '900' }}>← 뒤로</T>
          </Pressable>

          <T style={{ color: TEXT, fontSize: 18, fontWeight: '900' }}>개인정보처리방침</T>
        </View>

        <View
          style={{
            marginTop: 12,
            backgroundColor: CARD,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: LINE,
            padding: 14,
          }}
        >
          <T style={{ color: TEXT, fontSize: 14, fontWeight: '900' }}>1. 수집하는 정보</T>
          <T style={{ color: MUTED, marginTop: 8, lineHeight: 20 }}>
            • 계정 정보: 이메일(로그인/인증 목적){'\n'}
            • 프로필 정보: 닉네임(함께하기 화면 표기 목적){'\n'}
            • 서비스 이용 기록: 호흡/체크 기록(완료/휴식 등), 날짜별 기록(동기화 및 통계 제공 목적)
          </T>

          <T style={{ color: TEXT, fontSize: 14, fontWeight: '900', marginTop: 16 }}>2. 이용 목적</T>
          <T style={{ color: MUTED, marginTop: 8, lineHeight: 20 }}>
            • 회원 식별 및 로그인/인증{'\n'}
            • 호흡/기록 저장 및 기기 간 동기화{'\n'}
            • 서비스 품질 개선 및 오류 대응{'\n'}
            • 이용자 문의 대응
          </T>

          <T style={{ color: TEXT, fontSize: 14, fontWeight: '900', marginTop: 16 }}>3. 보관 및 파기</T>
          <T style={{ color: MUTED, marginTop: 8, lineHeight: 20 }}>
            • 계정/기록 정보는 서비스 제공을 위해 보관되며, 사용자가 “계정 삭제”를 요청하면 합리적인 기간 내 파기합니다.{'\n'}
            • 법령상 보관 의무가 있는 경우에 한하여 해당 기간 동안 별도 보관 후 파기합니다.
          </T>

          <T style={{ color: TEXT, fontSize: 14, fontWeight: '900', marginTop: 16 }}>4. 제3자 제공</T>
          <T style={{ color: MUTED, marginTop: 8, lineHeight: 20 }}>
            • 원칙적으로 개인정보를 제3자에게 제공하지 않습니다. 다만, 법령에 근거가 있는 경우 예외로 합니다.
          </T>

          <T style={{ color: TEXT, fontSize: 14, fontWeight: '900', marginTop: 16 }}>5. 처리 위탁</T>
          <T style={{ color: MUTED, marginTop: 8, lineHeight: 20 }}>
            서비스 운영을 위해 아래 업체에 개인정보 처리를 위탁할 수 있습니다.{'\n'}
            • Supabase, Inc.: 인증/데이터베이스/호스팅 인프라 제공
          </T>

          <T style={{ color: TEXT, fontSize: 14, fontWeight: '900', marginTop: 16 }}>6. 이용자 권리</T>
          <T style={{ color: MUTED, marginTop: 8, lineHeight: 20 }}>
            • 이용자는 언제든지 닉네임 변경 및 계정 삭제(탈퇴)를 요청할 수 있습니다.{'\n'}
            • 계정 삭제 시 계정 및 관련 데이터는 파기됩니다(복구 불가).
          </T>

          <T style={{ color: TEXT, fontSize: 14, fontWeight: '900', marginTop: 16 }}>7. 문의처</T>
          <T style={{ color: MUTED, marginTop: 8, lineHeight: 20 }}>
            • 이메일: zxcvbnm89432@gmail.com
          </T>

          <T style={{ color: MUTED, marginTop: 16, fontSize: 12 }}>
            시행일: {new Date().toISOString().slice(0, 10)}
          </T>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
