// src/screens/DashboardScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text as RNText,
  Pressable,
  Alert,
  RefreshControl,
  type TextProps,
  FlatList,
  type ListRenderItem,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  Switch,
  StyleSheet,
  DeviceEventEmitter,
  type EmitterSubscription,
} from 'react-native';
import dayjs from 'dayjs';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../api/supabaseClient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { DashboardStackParamList } from '../navigation/types';
import ScreenContainer from '../components/ScreenContainer';
import { fetchDailyLogs, upsertDailyLog, deleteDailyLog, type DailyLogRow, type DailyStatus } from '../api/dailyLogs';

/** ✅ 시스템 글씨 크기 영향 차단용 Text 래퍼 */
function T(props: TextProps) {
  return <RNText {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

const COLORS = {
  BG: '#0B0F14',
  CARD: '#121A23',
  LINE: '#1E2A38',
  TEXT: '#EAF2FF',
  MUTED: '#8FA3B8',

  DONE: '#4CC9FF',
  DONE_BG: 'rgba(76,201,255,0.18)',

  REST: '#3BE7B0',
  REST_BG: 'rgba(59,231,176,0.18)',

  NONE: '#6B7F96',
  NONE_BG: 'rgba(107,127,150,0.16)',
};

type Routine = {
  id: string;
  title: string;
  sort_order: number;
  is_active: boolean;
  group_key: string | null;
};

type MoodValue = 1 | 2 | 3 | 4 | 5;

const MOODS: Array<{
  v: MoodValue;
  emoji: string;
  label: string;
  sub: string;
  bg: string;
  bd: string;
  tx: string;
}> = [
  { v: 1, emoji: '😞', label: '너무 힘듦', sub: '버티는 중', bg: 'rgba(255,99,132,0.14)', bd: 'rgba(255,99,132,0.28)', tx: '#FF7AA2' },
  { v: 2, emoji: '😕', label: '힘듦', sub: '좀 무거움', bg: 'rgba(255,159,64,0.12)', bd: 'rgba(255,159,64,0.24)', tx: '#FFB37A' },
  { v: 3, emoji: '😐', label: '그저 그럼', sub: '무난함', bg: 'rgba(255,206,86,0.10)', bd: 'rgba(255,206,86,0.22)', tx: '#FFD88A' },
  { v: 4, emoji: '🙂', label: '괜찮음', sub: '숨이 트임', bg: 'rgba(75,192,192,0.10)', bd: 'rgba(75,192,192,0.22)', tx: '#76E7D6' },
  { v: 5, emoji: '😊', label: '좋음', sub: '가벼움', bg: 'rgba(76,201,255,0.12)', bd: 'rgba(76,201,255,0.24)', tx: COLORS.DONE },
];

// ✅ 알림 설정(매일)
type ReminderSetting = {
  is_enabled: boolean;
  message: string;
  updated_at?: string | null;
};

function getProjectIdSafe() {
  return (
    (Constants as any)?.expoConfig?.extra?.eas?.projectId ||
    (Constants as any)?.easConfig?.projectId ||
    (Constants as any)?.expoConfig?.extra?.projectId ||
    undefined
  );
}

const DAILY_HOUR = 21; // ✅ 매일 21:00
const DAILY_MINUTE = 0;
const ANDROID_CHANNEL_ID = 'default';

// ─────────────────────────────────────────────────────────────
// ✅ 루틴 row (memo)
// ─────────────────────────────────────────────────────────────
const RoutineRow = React.memo(function RoutineRow({
  routineId,
  title,
  status,
  saving,
  onOpenDetail,
  onDone,
  onRest,
  onClear,
}: {
  routineId: string;
  title: string;
  status: DailyStatus | undefined;
  saving: boolean;
  onOpenDetail: (routineId: string, title: string) => void;
  onDone: (routineId: string) => void;
  onRest: (routineId: string) => void;
  onClear: (routineId: string) => void;
}) {
  const doneActive = status === 'done';
  const restActive = status === 'rest';
  const hasAny = !!status;

  return (
    <Pressable
      onPress={() => onOpenDetail(routineId, title)}
      disabled={saving}
      style={[S.rowCard, saving && S.btnDisabled]}
      android_ripple={{ color: 'rgba(255,255,255,0.06)' }}
    >
      <View style={S.chevWrap} pointerEvents="none">
        <Ionicons name="chevron-forward" size={18} color="rgba(143,163,184,0.8)" />
      </View>

      <T style={S.rowTitle} numberOfLines={1}>
        {title}
      </T>

      <View style={S.rowBtns}>
        <Pressable
          onPress={() => onDone(routineId)}
          disabled={saving}
          style={[S.btn, doneActive ? S.btnDoneActive : S.btnInactive, saving && S.btnDisabled]}
        >
          <T style={[S.btnText, doneActive ? S.txDone : S.txMuted]}>완료</T>
        </Pressable>

        <Pressable
          onPress={() => onClear(routineId)}
          disabled={saving}
          style={[S.btnMid, hasAny ? S.btnMidActive : S.btnMidInactive, saving && S.btnDisabled]}
        >
          <T style={[S.btnText, S.txMuted]}>미체크</T>
        </Pressable>

        <Pressable
          onPress={() => onRest(routineId)}
          disabled={saving}
          style={[S.btn, restActive ? S.btnRestActive : S.btnInactive, saving && S.btnDisabled]}
        >
          <T style={[S.btnText, restActive ? S.txRest : S.txMuted]}>휴식</T>
        </Pressable>
      </View>
    </Pressable>
  );
}, (prev, next) => {
  return (
    prev.routineId === next.routineId &&
    prev.title === next.title &&
    prev.status === next.status &&
    prev.saving === next.saving
  );
});

// ─────────────────────────────────────────────────────────────
// ✅ Header (memo)
// ─────────────────────────────────────────────────────────────
const HeaderBlock = React.memo(function HeaderBlock({
  todayText,
  loading,
  todayMood,
  moodSaving,
  onMoodPick,
  onMoodClear,
  onGoCreate,
  allRest,
  disableRestAll,
  onToggleRestAll,
  routinesEmpty,
}: {
  todayText: string;
  loading: boolean;
  todayMood: MoodValue | null;
  moodSaving: boolean;
  onMoodPick: (v: MoodValue) => void;
  onMoodClear: () => void;
  onGoCreate: () => void;
  allRest: boolean;
  disableRestAll: boolean;
  onToggleRestAll: () => void;
  routinesEmpty: boolean;
}) {
  const moodMeta = todayMood ? MOODS.find((m) => m.v === todayMood) : null;

  return (
    <View style={S.headerWrap}>
      <T style={S.h1}>오늘의 호흡은 어땠나요</T>
      <T style={S.sub}>
        {todayText}
        {loading ? ' · 불러오는 중입니다…' : ''}
      </T>

      <View style={S.noticeCard}>
        <T style={S.noticeText}>
          <T style={S.noticeStrong}>오늘도 여기까지 오셨네요.</T>
          {'\n'}
          한 걸음이든, 쉬어 가는 날이든 괜찮습니다.
        </T>
      </View>

      <View style={S.moodCard}>
        <View style={S.moodTopRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <T style={S.cardTitle}>오늘의 기분</T>
            <T style={S.cardDesc}>상태를 남겨보세요</T>
          </View>

          {todayMood ? (
            <Pressable
              onPress={onMoodClear}
              disabled={moodSaving}
              hitSlop={10}
              style={[S.smallBtn, moodSaving && S.btnDisabled]}
            >
              <T style={S.smallBtnTx}>초기화</T>
            </Pressable>
          ) : null}
        </View>

        <View style={S.moodBtnsRow}>
          {MOODS.map((m) => {
            const active = todayMood === m.v;
            return (
              <Pressable
                key={m.v}
                onPress={() => onMoodPick(m.v)}
                disabled={moodSaving}
                style={[
                  S.moodBtn,
                  {
                    backgroundColor: active ? m.bg : '#0E141C',
                    borderColor: active ? m.bd : COLORS.LINE,
                    opacity: moodSaving ? 0.7 : 1,
                  },
                ]}
              >
                <T style={{ color: active ? m.tx : COLORS.MUTED, fontWeight: '900', fontSize: 18 }}>{m.emoji}</T>
              </Pressable>
            );
          })}
        </View>

        <View style={S.moodMetaBox}>
          {!moodMeta ? (
            <T style={S.moodMetaText}>아직 선택하지 않았습니다.</T>
          ) : (
            <T style={S.moodMetaText}>
              <T style={{ color: moodMeta.tx, fontWeight: '900' }}>
                {moodMeta.emoji} {moodMeta.label}
              </T>{' '}
              ({moodMeta.sub})
            </T>
          )}
        </View>
      </View>

      <View style={S.sectionRow}>
        <T style={S.sectionTitle}>오늘의 호흡</T>

        <Pressable onPress={onGoCreate} style={S.addBtn}>
          <T style={S.addBtnTx}>호흡 추가</T>
        </Pressable>
      </View>

      <Pressable
        onPress={onToggleRestAll}
        disabled={disableRestAll}
        style={[
          S.restAllBtn,
          {
            backgroundColor: allRest ? 'rgba(107,127,150,0.12)' : COLORS.REST_BG,
            borderColor: allRest ? 'rgba(107,127,150,0.28)' : 'rgba(59,231,176,0.28)',
            opacity: disableRestAll ? 0.6 : 1,
          },
        ]}
      >
        <T style={{ color: allRest ? COLORS.MUTED : COLORS.REST, fontWeight: '900' }}>
          {allRest ? '휴식 해제 (전체 미체크)' : '오늘은 쉽니다 (전체 휴식)'}
        </T>
      </Pressable>

      {routinesEmpty ? (
        <View style={S.emptyCard}>
          <T style={{ color: COLORS.MUTED }}>아직 활성화된 기록이 없습니다.</T>
        </View>
      ) : null}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────
// ✅ Footer (memo)
// ─────────────────────────────────────────────────────────────
const FooterBlock = React.memo(function FooterBlock({
  reminder,
  reminderSaving,
  timeText,
  onToggle,
  onChangeMessage,
  onTest,
}: {
  reminder: ReminderSetting;
  reminderSaving: boolean;
  timeText: string;
  onToggle: (v: boolean) => void;
  onChangeMessage: (t: string) => void;
  onTest: () => void;
}) {
  const dim = reminder.is_enabled ? 1 : 0.55;
  const cardEnabled = reminder.is_enabled && !reminderSaving;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <View style={S.footerPad}>
        <View style={S.reminderCard}>
          <View style={S.reminderTop}>
            <T style={S.cardTitle}>알림설정</T>

            <View style={S.switchRow}>
              <T style={{ color: reminder.is_enabled ? COLORS.DONE : COLORS.MUTED, fontWeight: '900', fontSize: 12 }}>
                {reminder.is_enabled ? '켜짐' : '꺼짐'}
              </T>
              <Switch
                value={reminder.is_enabled}
                onValueChange={onToggle}
                disabled={reminderSaving}
                trackColor={{ false: 'rgba(107,127,150,0.28)', true: 'rgba(76,201,255,0.35)' }}
                thumbColor={reminder.is_enabled ? COLORS.DONE : '#A9B7C8'}
              />
            </View>
          </View>

          <View style={{ marginTop: 10 }}>
            <T
              style={{
                color: reminder.is_enabled ? COLORS.MUTED : 'rgba(143,163,184,0.0)',
                fontSize: 12,
                lineHeight: 18,
              }}
            >
              {reminder.is_enabled ? (
                <>
                  매일 <T style={{ color: COLORS.TEXT, fontWeight: '900' }}>{timeText}</T>에 입력한 문구로 알림이 옵니다.
                </>
              ) : (
                ' '
              )}
            </T>
          </View>

          <View style={{ marginTop: 12, opacity: dim }}>
            <TextInput
              value={reminder.message}
              onChangeText={onChangeMessage}
              placeholder={reminder.is_enabled ? '알림 문구를 입력하세요' : '알림을 켜면 문구를 입력할 수 있어요'}
              placeholderTextColor="rgba(143,163,184,0.55)"
              multiline
              editable={reminder.is_enabled && !reminderSaving}
              style={S.reminderInput}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, opacity: dim }}>
            <Pressable
              onPress={onTest}
              disabled={!cardEnabled}
              style={[
                S.testBtn,
                {
                  backgroundColor: reminder.is_enabled ? 'rgba(107,127,150,0.10)' : 'rgba(107,127,150,0.06)',
                  borderColor: reminder.is_enabled ? 'rgba(107,127,150,0.24)' : 'rgba(30,42,56,0.8)',
                  opacity: !cardEnabled ? 0.55 : 1,
                },
              ]}
            >
              <T style={{ color: COLORS.MUTED, fontWeight: '900' }}>알림 테스트</T>
            </Pressable>
          </View>

          <View style={[S.reminderHint, { opacity: dim }]}>
            <T style={S.reminderHintTx}>{reminder.is_enabled ? <>알림이 켜져 있습니다.</> : <>알림이 꺼져 있습니다.</>}</T>
          </View>
        </View>
      </View>

      <View style={{ height: 120 }} />
    </KeyboardAvoidingView>
  );
});

export default function DashboardScreen() {
  const nav = useNavigation<NativeStackNavigationProp<DashboardStackParamList>>();

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [todayLogs, setTodayLogs] = useState<DailyLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ✅ mood
  const [todayMood, setTodayMoodState] = useState<MoodValue | null>(null);
  const [moodSaving, setMoodSaving] = useState(false);

  // ✅ reminder
  const [reminder, setReminder] = useState<ReminderSetting>({ is_enabled: false, message: '' });
  const [reminderSaving, setReminderSaving] = useState(false);

  const userIdRef = useRef<string>('');
  const savingRef = useRef<Record<string, boolean>>({});
  const bulkRef = useRef(false);

  // ✅ 알림 동기화 가드
  const reminderSyncedRef = useRef<{
    uid: string;
    updated_at?: string | null;
    enabled: boolean;
    msg: string;
  } | null>(null);

  const todayKey = useMemo(() => dayjs().format('YYYY-MM-DD'), []);
  const todayText = useMemo(() => dayjs().format('M/D ddd'), []);
  const timeText = useMemo(
    () => `${String(DAILY_HOUR).padStart(2, '0')}:${String(DAILY_MINUTE).padStart(2, '0')}`,
    []
  );

  // ─────────────────────────────────────────────────────────────
  // ✅ 알림 핸들러/채널 (1회)
  // ─────────────────────────────────────────────────────────────
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

    (async () => {
      if (Platform.OS === 'android') {
        try {
          await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
            name: 'Default',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#4CC9FF',
          });
        } catch {}
      }
    })();
  }, []);

  const ensurePushToken = useCallback(async (uid: string): Promise<string | null> => {
    try {
      const current = await Notifications.getPermissionsAsync();
      let status = current.status;
      if (status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      if (status !== 'granted') return null;

      const projectId = getProjectIdSafe();

      let token: string | null = null;
      try {
        const tokenRes = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        token = tokenRes.data;
      } catch {
        token = null;
      }

      if (token) {
        await supabase.from('profiles').upsert(
          { user_id: uid, expo_push_token: token, updated_at: new Date().toISOString() } as any,
          { onConflict: 'user_id' }
        );
      }

      return token;
    } catch {
      return null;
    }
  }, []);

  const cancelDailyNotifications = useCallback(async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {}
  }, []);

  const scheduleDailyNotification = useCallback(
    async (message: string) => {
      await cancelDailyNotifications();
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
    },
    [cancelDailyNotifications]
  );

  const syncLocalReminderSchedule = useCallback(
    async (uid: string, setting: ReminderSetting) => {
      const msg = (setting.message ?? '').trim();
      const key = {
        uid,
        updated_at: setting.updated_at ?? null,
        enabled: !!setting.is_enabled,
        msg,
      };
      const last = reminderSyncedRef.current;

      if (last && last.uid === key.uid && last.updated_at === key.updated_at && last.enabled === key.enabled && last.msg === key.msg) {
        return;
      }

      try {
        if (!setting.is_enabled || !msg) await cancelDailyNotifications();
        else await scheduleDailyNotification(msg);
      } finally {
        reminderSyncedRef.current = key;
      }
    },
    [cancelDailyNotifications, scheduleDailyNotification]
  );

  const sendTestNotification = useCallback(async (message: string) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '브리드 (테스트)',
        body: message || '테스트 알림입니다.',
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, repeats: false },
    });
  }, []);

  const loadReminder = useCallback(async (uid: string): Promise<ReminderSetting> => {
    try {
      const { data, error } = await supabase
        .from('reminder_settings')
        .select('is_enabled,message,updated_at')
        .eq('user_id', uid)
        .maybeSingle();

      if (error) {
        const fallback = { is_enabled: false, message: '' };
        setReminder(fallback);
        return fallback;
      }

      const next: ReminderSetting = {
        is_enabled: !!data?.is_enabled,
        message: (data?.message ?? '') as string,
        updated_at: (data?.updated_at ?? null) as any,
      };
      setReminder(next);
      return next;
    } catch {
      const fallback = { is_enabled: false, message: '' };
      setReminder(fallback);
      return fallback;
    }
  }, []);

  const persistReminder = useCallback(async (next: ReminderSetting) => {
    const uid = userIdRef.current;
    if (!uid) return null;

    const msg = (next.message ?? '').trim();
    if (next.is_enabled && !msg) throw new Error('empty_message');

    const updatedAt = new Date().toISOString();

    const { error } = await supabase.from('reminder_settings').upsert(
      { user_id: uid, is_enabled: next.is_enabled, message: next.message ?? '', updated_at: updatedAt } as any,
      { onConflict: 'user_id' }
    );
    if (error) throw error;

    const updated: ReminderSetting = { is_enabled: next.is_enabled, message: next.message ?? '', updated_at: updatedAt };
    setReminder(updated);
    return updated;
  }, []);

  const toggleReminder = useCallback(
    async (enable: boolean) => {
      const uid = userIdRef.current;
      if (!uid || reminderSaving) return;

      const msg = reminder.message.trim();

      setReminderSaving(true);
      try {
        const current = await Notifications.getPermissionsAsync();
        let status = current.status;
        if (status !== 'granted') {
          const req = await Notifications.requestPermissionsAsync();
          status = req.status;
        }
        if (status !== 'granted') {
          Alert.alert('알림 권한이 필요합니다', '설정에서 알림 권한을 허용해 주세요.');
          setReminder((p) => ({ ...p, is_enabled: false }));
          return;
        }

        if (enable && !msg) {
          Alert.alert('문구가 비어 있어요', '알림 문구를 입력한 뒤 켜 주세요.');
          setReminder((p) => ({ ...p, is_enabled: false }));
          return;
        }

        ensurePushToken(uid).catch(() => null);

        if (enable) {
          await scheduleDailyNotification(msg);
          const updated = await persistReminder({ is_enabled: true, message: reminder.message });
          if (updated) await syncLocalReminderSchedule(uid, updated);
        } else {
          await cancelDailyNotifications();
          const updated = await persistReminder({ is_enabled: false, message: reminder.message });
          if (updated) await syncLocalReminderSchedule(uid, updated);
        }
      } catch (e: any) {
        if (e?.message === 'empty_message') {
          Alert.alert('문구가 비어 있어요', '알림 문구를 입력해 주세요.');
        } else {
          Alert.alert('알림 처리 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
        }
        const fresh = await loadReminder(uid);
        await syncLocalReminderSchedule(uid, fresh);
      } finally {
        setReminderSaving(false);
      }
    },
    [cancelDailyNotifications, ensurePushToken, loadReminder, persistReminder, reminder.message, reminderSaving, scheduleDailyNotification, syncLocalReminderSchedule]
  );

  const runTest = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid || reminderSaving) return;

    const msg = reminder.message.trim();
    if (!msg) {
      Alert.alert('문구가 비어 있어요', '테스트할 문구를 먼저 입력해 주세요.');
      return;
    }

    setReminderSaving(true);
    try {
      const current = await Notifications.getPermissionsAsync();
      let status = current.status;
      if (status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      if (status !== 'granted') {
        Alert.alert('알림 권한이 필요합니다', '설정에서 알림 권한을 허용해 주세요.');
        return;
      }
      await sendTestNotification(msg);
    } catch (e: any) {
      Alert.alert('테스트 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
    } finally {
      setReminderSaving(false);
    }
  }, [reminder.message, reminderSaving, sendTestNotification]);

  const loadTodayMood = useCallback(async (uid: string) => {
    try {
      const { data, error } = await supabase.from('mood_logs').select('mood').eq('user_id', uid).eq('date_key', todayKey).maybeSingle();
      if (error) {
        setTodayMoodState(null);
        return;
      }
      const v = data?.mood;
      if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5) setTodayMoodState(v);
      else setTodayMoodState(null);
    } catch {
      setTodayMoodState(null);
    }
  }, [todayKey]);

  const setTodayMood = useCallback(async (v: MoodValue) => {
    const uid = userIdRef.current;
    if (!uid || moodSaving) return;

    setMoodSaving(true);
    setTodayMoodState(v);

    try {
      const payload = { user_id: uid, date_key: todayKey, mood: v, updated_at: new Date().toISOString() };
      const { error } = await supabase.from('mood_logs').upsert(payload as any, { onConflict: 'user_id,date_key' });
      if (error) {
        Alert.alert('기분 저장 실패', error.message);
        await loadTodayMood(uid);
      }
    } catch (e: any) {
      Alert.alert('기분 저장 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
      await loadTodayMood(uid);
    } finally {
      setMoodSaving(false);
    }
  }, [loadTodayMood, moodSaving, todayKey]);

  const clearTodayMood = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid || moodSaving) return;

    setMoodSaving(true);
    setTodayMoodState(null);

    try {
      const { error } = await supabase.from('mood_logs').delete().eq('user_id', uid).eq('date_key', todayKey);
      if (error) {
        Alert.alert('기분 삭제 실패', error.message);
        await loadTodayMood(uid);
      }
    } catch (e: any) {
      Alert.alert('기분 삭제 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
      await loadTodayMood(uid);
    } finally {
      setMoodSaving(false);
    }
  }, [loadTodayMood, moodSaving, todayKey]);

  // ─────────────────────────────────────────────────────────────
  // ✅ load
  // ─────────────────────────────────────────────────────────────
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);

    try {
      let uid = userIdRef.current;
      if (!uid) {
        const user = (await supabase.auth.getUser()).data.user;
        if (!user) return;
        uid = user.id;
        userIdRef.current = uid;
      }

      const routinesPromise = supabase
        .from('routines')
        .select('id,title,sort_order,is_active,group_key')
        .eq('user_id', uid)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      const logsPromise = fetchDailyLogs({ userId: uid, dateKey: todayKey });
      const moodPromise = loadTodayMood(uid);
      const reminderPromise = loadReminder(uid);

      const [rRes, logs, reminderSetting] = await Promise.all([
        routinesPromise,
        logsPromise,
        moodPromise,
        reminderPromise,
      ]).then((arr) => [arr[0] as any, arr[1] as any, arr[3] as any]);

      syncLocalReminderSchedule(uid, reminderSetting as ReminderSetting).catch(() => null);

      if (rRes.error) Alert.alert('기록 불러오기 실패', rRes.error.message);

      setRoutines((rRes.data as any) || []);
      setTodayLogs((logs as any) || []);
    } catch (e: any) {
      Alert.alert('데이터 불러오기 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loadReminder, loadTodayMood, todayKey, syncLocalReminderSchedule]);

  useEffect(() => {
    load();
  }, [load]);

  // ✅✅✅ 이벤트 리스너는 반드시 load 정의 이후에!
  useEffect(() => {
    const subs: EmitterSubscription[] = [];

    // ✅ 삭제 즉시 반영 + silent load
    subs.push(
      DeviceEventEmitter.addListener('ROUTINE_DELETED', (payload: { routineId: string }) => {
        const rid = payload?.routineId;
        if (!rid) return;

        setRoutines((prev) => prev.filter((r) => r.id !== rid));
        setTodayLogs((prev) => prev.filter((x) => x.routine_id !== rid));

        load({ silent: true }).catch(() => null);
      })
    );

    // ✅ 생성 이벤트(옵션: create 화면에서 emit하면 무거운 full refresh 줄일 수 있음)
    subs.push(
      DeviceEventEmitter.addListener('ROUTINE_CREATED', (created: Routine) => {
        if (!created?.id) return;
        setRoutines((prev) => {
          const filtered = prev.filter((r) => r.id !== created.id);
          return [...filtered, created].sort((a, b) => a.sort_order - b.sort_order);
        });
        load({ silent: true }).catch(() => null);
      })
    );

    subs.push(
      DeviceEventEmitter.addListener('ROUTINES_CHANGED', () => {
        load({ silent: true }).catch(() => null);
      })
    );

    return () => subs.forEach((s) => s.remove());
  }, [load]);

  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshing]);

  // ✅ statusMap
  const statusMap = useMemo(() => {
    const m = new Map<string, DailyStatus>();
    for (const row of todayLogs) m.set(row.routine_id, row.status);
    return m;
  }, [todayLogs]);

  const allRest = useMemo(() => {
    if (routines.length === 0) return false;
    return routines.every((r) => statusMap.get(r.id) === 'rest');
  }, [routines, statusMap]);

  // ─────────────────────────────────────────────────────────────
  // ✅ Dashboard → (Tabs) Insights → RoutineDetail
  //  - params 갱신 안되는 케이스(탭 전환) 대비로 이벤트도 같이 쏴줌
  // ─────────────────────────────────────────────────────────────
  const openRoutineDetail = useCallback((routineId: string, title: string) => {
    // 1) RoutineDetail이 이미 떠있어도 바뀌게(탭 상태 유지 케이스 대응)
    DeviceEventEmitter.emit('OPEN_ROUTINE_DETAIL', { routineId, title });

    // 2) 탭 이동 + (가능하면) nested screen 지정
    nav.getParent()?.navigate('Insights' as any, {
      screen: 'RoutineDetail',
      params: { routineId, title },
      // merge: true를 완전히 보장하긴 어려워서 이벤트를 함께 사용
      merge: true,
    } as any);
  }, [nav]);

  // ─────────────────────────────────────────────────────────────
  // ✅ Status handlers
  // ─────────────────────────────────────────────────────────────
  const setStatusById = useCallback(async (routineId: string, status: DailyStatus) => {
    const uid = userIdRef.current;
    if (!uid) return;
    if (savingRef.current[routineId]) return;
    savingRef.current[routineId] = true;

    const prev = todayLogs;
    setTodayLogs((p) => {
      const next = p.filter((x) => x.routine_id !== routineId);
      next.push({ user_id: uid, date_key: todayKey, routine_id: routineId, status } as any);
      return next;
    });

    try {
      const saved = await upsertDailyLog({ userId: uid, dateKey: todayKey, routineId, status });
      setTodayLogs((p) => p.filter((x) => x.routine_id !== routineId).concat(saved));
    } catch (e: any) {
      setTodayLogs(prev);
      Alert.alert('저장 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
    } finally {
      savingRef.current[routineId] = false;
    }
  }, [todayKey, todayLogs]);

  const clearStatusById = useCallback(async (routineId: string) => {
    const uid = userIdRef.current;
    if (!uid) return;
    if (savingRef.current[routineId]) return;
    savingRef.current[routineId] = true;

    const prev = todayLogs;
    setTodayLogs((p) => p.filter((x) => x.routine_id !== routineId));

    try {
      await deleteDailyLog({ userId: uid, dateKey: todayKey, routineId });
    } catch (e: any) {
      setTodayLogs(prev);
      Alert.alert('저장 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
    } finally {
      savingRef.current[routineId] = false;
    }
  }, [todayKey, todayLogs]);

  const onDone = useCallback((routineId: string) => setStatusById(routineId, 'done'), [setStatusById]);
  const onRest = useCallback((routineId: string) => setStatusById(routineId, 'rest'), [setStatusById]);
  const onClear = useCallback((routineId: string) => clearStatusById(routineId), [clearStatusById]);

  const toggleRestAll = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    if (bulkRef.current) return;
    bulkRef.current = true;

    try {
      if (routines.length === 0) return;

      if (allRest) {
        const prev = todayLogs;
        setTodayLogs([]);
        try {
          await Promise.all(
            routines.map((r) => deleteDailyLog({ userId: uid, dateKey: todayKey, routineId: r.id }).catch(() => null))
          );
        } catch (e: any) {
          setTodayLogs(prev);
          Alert.alert('휴식 해제 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
          return;
        }
        await load({ silent: true });
        return;
      }

      const prev = todayLogs;
      setTodayLogs(() =>
        routines.map((r) => ({ user_id: uid, date_key: todayKey, routine_id: r.id, status: 'rest' }) as any)
      );

      try {
        await Promise.all(routines.map((r) => upsertDailyLog({ userId: uid, dateKey: todayKey, routineId: r.id, status: 'rest' })));
      } catch (e: any) {
        setTodayLogs(prev);
        Alert.alert('저장 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
        return;
      }

      await load({ silent: true });
    } finally {
      bulkRef.current = false;
    }
  }, [allRest, load, routines, todayKey, todayLogs]);

  // ✅ FlatList renderItem
  const renderItem: ListRenderItem<Routine> = useCallback(({ item }) => {
    const st = statusMap.get(item.id);
    const saving = !!savingRef.current[item.id];

    return (
      <RoutineRow
        routineId={item.id}
        title={item.title}
        status={st}
        saving={saving}
        onOpenDetail={openRoutineDetail}
        onDone={onDone}
        onRest={onRest}
        onClear={onClear}
      />
    );
  }, [statusMap, openRoutineDetail, onDone, onRest, onClear]);

  const listHeader = useCallback(() => (
    <HeaderBlock
      todayText={todayText}
      loading={loading}
      todayMood={todayMood}
      moodSaving={moodSaving}
      onMoodPick={setTodayMood}
      onMoodClear={clearTodayMood}
      onGoCreate={() => nav.navigate('RoutineCreate')}
      allRest={allRest}
      disableRestAll={loading || routines.length === 0}
      onToggleRestAll={toggleRestAll}
      routinesEmpty={routines.length === 0}
    />
  ), [todayText, loading, todayMood, moodSaving, setTodayMood, clearTodayMood, nav, allRest, toggleRestAll, routines.length]);

  const onChangeReminderMessage = useCallback((t: string) => {
    setReminder((p) => ({ ...p, message: t }));
  }, []);

  const listFooter = useCallback(() => (
    <FooterBlock
      reminder={reminder}
      reminderSaving={reminderSaving}
      timeText={timeText}
      onToggle={toggleReminder}
      onChangeMessage={onChangeReminderMessage}
      onTest={runTest}
    />
  ), [reminder, reminderSaving, timeText, toggleReminder, onChangeReminderMessage, runTest]);

  return (
    <ScreenContainer bg={COLORS.BG} barStyle="light-content">
      <FlatList
        data={routines.length === 0 ? [] : routines}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={S.listContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.DONE}
            colors={[COLORS.DONE]}
            progressBackgroundColor="#0E141C"
          />
        }
        initialNumToRender={10}
        windowSize={9}
        maxToRenderPerBatch={14}
        updateCellsBatchingPeriod={16}
        removeClippedSubviews={Platform.OS === 'android'}
      />
    </ScreenContainer>
  );
}

const S = StyleSheet.create({
  listContainer: { paddingBottom: 160 },

  headerWrap: { padding: 14, paddingBottom: 12 },
  h1: { color: COLORS.TEXT, fontSize: 24, fontWeight: '900' },
  sub: { color: COLORS.MUTED, marginTop: 4 },

  noticeCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#0E141C',
    borderWidth: 1,
    borderColor: COLORS.LINE,
  },
  noticeText: { color: COLORS.MUTED, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  noticeStrong: { color: COLORS.TEXT, fontWeight: '900' },

  moodCard: {
    marginTop: 12,
    backgroundColor: COLORS.CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.LINE,
    padding: 14,
  },
  moodTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: COLORS.TEXT, fontWeight: '900' },
  cardDesc: { color: COLORS.MUTED, marginTop: 6, fontSize: 12, lineHeight: 18 },

  smallBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(107,127,150,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(107,127,150,0.24)',
  },
  smallBtnTx: { color: COLORS.MUTED, fontWeight: '900', fontSize: 12 },

  moodBtnsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  moodBtn: { flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center', borderWidth: 1 },

  moodMetaBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#0E141C',
    borderWidth: 1,
    borderColor: COLORS.LINE,
  },
  moodMetaText: { color: COLORS.MUTED, fontSize: 12, lineHeight: 18, textAlign: 'center' },

  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 },
  sectionTitle: { color: COLORS.TEXT, fontWeight: '900' },
  addBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: COLORS.DONE_BG,
    borderWidth: 1,
    borderColor: 'rgba(76,201,255,0.28)',
  },
  addBtnTx: { color: COLORS.DONE, fontWeight: '900', fontSize: 12 },

  restAllBtn: {
    marginTop: 10,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
  },

  emptyCard: {
    marginTop: 10,
    backgroundColor: COLORS.CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.LINE,
    padding: 14,
  },

  rowCard: {
    marginHorizontal: 14,
    marginTop: 10,
    backgroundColor: COLORS.CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.LINE,
    padding: 12,
  },
  rowTitle: { color: COLORS.TEXT, fontWeight: '900', paddingRight: 22 },
  rowBtns: { flexDirection: 'row', gap: 8, marginTop: 10 },

  chevWrap: {
    position: 'absolute',
    top: 10,
    right: 10,
    opacity: 0.9,
  },

  btn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  btnMid: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1, minWidth: 52 },

  btnInactive: { backgroundColor: '#0E141C', borderColor: COLORS.LINE },
  btnDoneActive: { backgroundColor: COLORS.DONE_BG, borderColor: 'rgba(76,201,255,0.35)' },
  btnRestActive: { backgroundColor: COLORS.REST_BG, borderColor: 'rgba(59,231,176,0.35)' },

  btnMidInactive: { backgroundColor: 'rgba(107,127,150,0.08)', borderColor: COLORS.LINE },
  btnMidActive: { backgroundColor: COLORS.NONE_BG, borderColor: 'rgba(107,127,150,0.24)' },

  btnText: { fontWeight: '900' },
  txDone: { color: COLORS.DONE },
  txRest: { color: COLORS.REST },
  txMuted: { color: COLORS.MUTED },

  btnDisabled: { opacity: 0.6 },

  footerPad: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 28 },
  reminderCard: {
    backgroundColor: '#0E141C',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.LINE,
    padding: 14,
  },
  reminderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  reminderInput: {
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#0B0F14',
    borderWidth: 1,
    borderColor: COLORS.LINE,
    color: COLORS.TEXT,
    fontSize: 14,
    lineHeight: 20,
  },

  testBtn: { flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', borderWidth: 1 },

  reminderHint: {
    marginTop: 12,
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#0B0F14',
    borderWidth: 1,
    borderColor: COLORS.LINE,
  },
  reminderHintTx: { color: COLORS.MUTED, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
