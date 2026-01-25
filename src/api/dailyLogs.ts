// src/api/dailyLogs.ts
import { supabase } from './supabaseClient';

export type DailyStatus = 'done' | 'rest';

export type DailyLogRow = {
  user_id: string;
  date_key: string;      // 'YYYY-MM-DD'
  routine_id: string;    // routine id
  status: DailyStatus;   // 'done' | 'rest'
};

type FetchDailyLogsArgs = {
  userId: string;
  dateKey: string; // 'YYYY-MM-DD'
};

type UpsertDailyLogArgs = {
  userId: string;
  dateKey: string;
  routineId: string;
  status: DailyStatus;
};

type DeleteDailyLogArgs = {
  userId: string;
  dateKey: string;
  routineId: string;
};

function humanError(e: any) {
  return e?.message ?? String(e);
}

/**
 * ✅ 특정 날짜의 기록 상태들을 가져옴
 */
export async function fetchDailyLogs(args: FetchDailyLogsArgs): Promise<DailyLogRow[]> {
  const { userId, dateKey } = args;

  const { data, error } = await supabase
    .from('daily_logs')
    .select('user_id,date_key,routine_id,status')
    .eq('user_id', userId)
    .eq('date_key', dateKey);

  if (error) throw new Error(humanError(error));
  return (data as DailyLogRow[] | null) ?? [];
}

/**
 * ✅ done/rest 저장(미체크가 아니라면 row가 있어야 하므로 upsert)
 *
 * 전제:
 * - daily_logs 테이블에 UNIQUE 제약이 있어야 깔끔함:
 *   (user_id, date_key, routine_id)
 */
export async function upsertDailyLog(args: UpsertDailyLogArgs): Promise<DailyLogRow> {
  const { userId, dateKey, routineId, status } = args;

  const payload: DailyLogRow = {
    user_id: userId,
    date_key: dateKey,
    routine_id: routineId,
    status,
  };

  // ✅ onConflict는 "unique constraint"와 맞아야 함
  const { data, error } = await supabase
    .from('daily_logs')
    .upsert(payload as any, { onConflict: 'user_id,date_key,routine_id' })
    .select('user_id,date_key,routine_id,status')
    .single();

  if (error) throw new Error(humanError(error));
  return data as DailyLogRow;
}

/**
 * ✅ 미체크(—) = 서버에서도 "진짜로" row 제거
 *
 * - 해당 날짜/기록 row를 삭제하면
 * - 다음 로드(fetchDailyLogs)에서 안 내려오므로
 * - 앱에서도 "미체크"가 유지됨
 */
export async function deleteDailyLog(args: DeleteDailyLogArgs): Promise<void> {
  const { userId, dateKey, routineId } = args;

  const { error } = await supabase
    .from('daily_logs')
    .delete()
    .eq('user_id', userId)
    .eq('date_key', dateKey)
    .eq('routine_id', routineId);

  if (error) throw new Error(humanError(error));
}
