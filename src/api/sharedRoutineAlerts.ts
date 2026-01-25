// src/api/sharedRoutineAlerts.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import dayjs from 'dayjs';
import { supabase } from './supabaseClient';
import { fetchStatusesRange, type DailyStatus } from './sharedRoutines';

/**
 * 조건부 알림 정책
 * - 미체크(오늘 포함) 연속 누적이 3/7/14 이상이면 알림 발동
 * - 매일 21:00(로컬) 1회 알림을 예약(앱이 열릴 때 갱신)
 */
const THRESHOLDS = [3, 7, 14] as const;

const STORAGE_PREFIX = 'breath:sharedRoutine:alert:'; // + roomId
const KEY_LAST_LEVEL = (roomId: string) => `${STORAGE_PREFIX}${roomId}:lastLevel`;
const KEY_NOTIF_ID = (roomId: string) => `${STORAGE_PREFIX}${roomId}:notifId`;

const DEFAULT_HOUR = 21;
const DEFAULT_MIN = 0;

/** iOS/Android 공통: 알림 핸들러(조용히 표시) - 앱 진입 시 1회만 설정하면 됩니다. */
export function configureNotificationHandlerOnce() {
  // 중복 설정 방지용
  // @ts-ignore
  if (global.__BREATH_NOTIF_HANDLER__) return;
  // @ts-ignore
  global.__BREATH_NOTIF_HANDLER__ = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensurePermission() {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const req = await Notifications.requestPermissionsAsync();
  return !!req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

function nextTriggerAt(hour = DEFAULT_HOUR, minute = DEFAULT_MIN) {
  const now = dayjs();
  const t = now.hour(hour).minute(minute).second(0);
  // 이미 시간이 지났으면 다음날
  const next = t.isAfter(now) ? t : t.add(1, 'day');
  return next.toDate();
}

/**
 * 미체크 누적(연속) 계산
 * - status가 있는 날은 체크로 간주(완료/휴식)
 * - status가 없으면 미체크로 간주
 * - 오늘부터 과거로 내려가면서 연속 미체크만 카운트
 */
export function calcMissStreak(
  rangeKeysDesc: string[], // e.g. [today, yesterday, ...]
  statuses: DailyStatus[],
  userId: string
) {
  const set = new Set<string>();
  for (const s of statuses) {
    if (s.user_id === userId) set.add(s.date_key);
  }

  let streak = 0;
  for (const dk of rangeKeysDesc) {
    if (set.has(dk)) break;
    streak += 1;
  }
  return streak;
}

async function cancelIfExists(roomId: string) {
  const notifId = await AsyncStorage.getItem(KEY_NOTIF_ID(roomId));
  if (notifId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notifId);
    } catch {
      // ignore
    }
    await AsyncStorage.removeItem(KEY_NOTIF_ID(roomId));
  }
}

/**
 * roomId 기준으로 "미체크 누적"을 평가하고,
 * 임계치 도달 시 오늘/내일 21:00 알림을 예약합니다.
 *
 * 호출 타이밍(추천):
 * - ConnectSharedScreen load/refresh 후 (모든 roomId에 대해)
 * - SharedRoutineBoardScreen load/refresh 후 (해당 roomId)
 */
export async function evaluateAndScheduleRoomMissAlert(params: {
  roomId: string;
  routineTitle: string;
  // 최근 N일로 평가할지 (8주면 56)
  lookbackDays?: number;
  fireHour?: number;
  fireMinute?: number;
}) {
  const { roomId, routineTitle, lookbackDays = 56, fireHour = DEFAULT_HOUR, fireMinute = DEFAULT_MIN } = params;

  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return;

  configureNotificationHandlerOnce();

  const ok = await ensurePermission();
  if (!ok) return;

  // 최근 N일 날짜 키 생성 (desc)
  const keysDesc: string[] = [];
  for (let i = 0; i < lookbackDays; i++) {
    keysDesc.push(dayjs().subtract(i, 'day').format('YYYY-MM-DD'));
  }
  const fromKey = keysDesc[keysDesc.length - 1];
  const toKey = keysDesc[0];

  const statuses = await fetchStatusesRange(roomId, fromKey, toKey);
  const missStreak = calcMissStreak(keysDesc, statuses, user.id);

  // 어느 임계치에 해당하는지
  const level =
    missStreak >= 14 ? 14 :
    missStreak >= 7 ? 7 :
    missStreak >= 3 ? 3 : 0;

  const lastLevelRaw = await AsyncStorage.getItem(KEY_LAST_LEVEL(roomId));
  const lastLevel = lastLevelRaw ? Number(lastLevelRaw) : 0;

  if (level === 0) {
    // 체크가 시작되면 알림/레벨 리셋
    if (lastLevel !== 0) {
      await AsyncStorage.setItem(KEY_LAST_LEVEL(roomId), '0');
    }
    await cancelIfExists(roomId);
    return;
  }

  // 동일 레벨로 이미 예약돼 있으면 그대로 두고 종료
  if (level === lastLevel) return;

  // 레벨이 바뀌면 기존 예약은 교체
  await cancelIfExists(roomId);

  const title = '기록이 비어 있습니다';
  const body =
    level === 3
      ? `최근 ${missStreak}일 동안 기록이 없었습니다. "${routineTitle}"를 오늘 상태로 기록해 주세요.`
      : level === 7
      ? `최근 ${missStreak}일 동안 기록이 없었습니다. 부담 없이 "${routineTitle}" 상태만 체크해 주세요.`
      : `최근 ${missStreak}일 동안 기록이 없었습니다. "${routineTitle}"를 다시 시작하실 수 있도록 도와드리겠습니다.`;

  const triggerDate = nextTriggerAt(fireHour, fireMinute);

  const id = await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: triggerDate,
  });

  await AsyncStorage.setItem(KEY_NOTIF_ID(roomId), id);
  await AsyncStorage.setItem(KEY_LAST_LEVEL(roomId), String(level));
}

/**
 * 사용자가 오늘 상태를 기록했을 때, 즉시 알림을 해제/리셋하고 싶다면 호출합니다.
 */
export async function resetRoomMissAlert(roomId: string) {
  await AsyncStorage.setItem(KEY_LAST_LEVEL(roomId), '0');
  await cancelIfExists(roomId);
}
