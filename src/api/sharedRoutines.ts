import dayjs from 'dayjs';
import { supabase } from './supabaseClient';

export type SharedRoom = {
  id: string;
  routine_id: string;
  owner_id: string;
  join_code: string;
  is_active: boolean;
  created_at: string;
  routine_title?: string;
};

export type Member = {
  room_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  display_name?: string | null;
};

export type DailyStatus = {
  room_id: string;
  user_id: string;
  date_key: string; // YYYY-MM-DD
  status: 'focus' | 'rest';
  created_at: string;
};

const genCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

export async function getRoomById(roomId: string) {
  const { data, error } = await supabase
    .from('shared_routine_rooms')
    .select('id,routine_id,owner_id,join_code,is_active,created_at')
    .eq('id', roomId)
    .maybeSingle();

  if (error) throw error;
  return data as any as SharedRoom | null;
}

export async function getRoomByRoutineId(routineId: string) {
  const { data, error } = await supabase
    .from('shared_routine_rooms')
    .select('id,routine_id,owner_id,join_code,is_active,created_at')
    .eq('routine_id', routineId)
    .maybeSingle();

  if (error) throw error;
  return data as any as SharedRoom | null;
}

/**
 * 내 기록을 공유(방 생성 or 기존 방 반환)
 */
export async function ensureRoomForRoutine(routineId: string) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('로그인이 필요합니다.');

  const existing = await getRoomByRoutineId(routineId);
  if (existing) {
    // 혹시 멤버 등록이 안 되어 있을 수 있으니 시도 (중복은 무시)
    const { error: mErr } = await supabase.from('shared_routine_members').insert({
      room_id: existing.id,
      user_id: user.id,
      role: 'owner',
    });
    if (mErr && !String(mErr.message).toLowerCase().includes('duplicate')) throw mErr;
    return existing;
  }

  let lastErr: any = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const join_code = genCode();

    const { data: room, error } = await supabase
      .from('shared_routine_rooms')
      .insert({
        routine_id: routineId,
        owner_id: user.id,
        join_code,
        is_active: true,
      })
      .select('id,routine_id,owner_id,join_code,is_active,created_at')
      .maybeSingle();

    if (error) {
      lastErr = error;
      const msg = String(error.message).toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique')) continue;
      throw error;
    }

    const { error: mErr } = await supabase.from('shared_routine_members').insert({
      room_id: (room as any).id,
      user_id: user.id,
      role: 'owner',
    });

    if (mErr && !String(mErr.message).toLowerCase().includes('duplicate')) throw mErr;

    return room as any as SharedRoom;
  }

  throw lastErr ?? new Error('공유 기록 생성에 실패하였습니다.');
}

export async function findRoomByCode(code: string) {
  const c = code.trim().toUpperCase();
  const { data, error } = await supabase
    .from('shared_routine_rooms')
    .select('id,routine_id,owner_id,join_code,is_active,created_at')
    .eq('join_code', c)
    .maybeSingle();

  if (error) throw error;
  return data as any as SharedRoom | null;
}

export async function joinRoom(roomId: string) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('로그인이 필요합니다.');

  const { error } = await supabase.from('shared_routine_members').insert({
    room_id: roomId,
    user_id: user.id,
    role: 'member',
  });

  if (error) {
    const msg = String(error.message).toLowerCase();
    if (msg.includes('duplicate')) return; // 이미 가입
    throw error;
  }
}

/**
 * 내가 참여한 공유방 목록 + routines.title 매핑
 */
export async function fetchMySharedRooms() {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('로그인이 필요합니다.');

  const { data: ms, error: mErr } = await supabase
    .from('shared_routine_members')
    .select('room_id,role')
    .eq('user_id', user.id);

  if (mErr) throw mErr;

  const roomIds = ((ms as any) || []).map((x: any) => x.room_id) as string[];
  if (roomIds.length === 0) return [] as SharedRoom[];

  const { data: rooms, error: rErr } = await supabase
    .from('shared_routine_rooms')
    .select('id,routine_id,owner_id,join_code,is_active,created_at')
    .in('id', roomIds)
    .order('created_at', { ascending: false });

  if (rErr) throw rErr;

  const routineIds = Array.from(new Set(((rooms as any) || []).map((x: any) => x.routine_id)));

  const { data: routines, error: ruErr } = await supabase
    .from('routines')
    .select('id,title')
    .in('id', routineIds);

  if (ruErr) throw ruErr;

  const titleMap = new Map<string, string>();
  for (const row of (routines as any) || []) titleMap.set(row.id, row.title ?? '기록');

  return (((rooms as any) || []) as SharedRoom[]).map((x) => ({
    ...x,
    routine_title: titleMap.get(x.routine_id) ?? '기록',
  }));
}

export async function upsertTodayStatus(roomId: string, status: 'focus' | 'rest') {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('로그인이 필요합니다.');

  const date_key = dayjs().format('YYYY-MM-DD');

  const { error } = await supabase.from('shared_routine_daily_status').upsert(
    {
      room_id: roomId,
      user_id: user.id,
      date_key,
      status,
    },
    { onConflict: 'room_id,user_id,date_key' }
  );

  if (error) throw error;
}

export async function fetchBoard(roomId: string, dateKey: string) {
  const { data: members, error: mErr } = await supabase
    .from('shared_routine_members')
    .select('room_id,user_id,role,joined_at')
    .eq('room_id', roomId);

  if (mErr) throw mErr;

  const userIds = ((members as any) || []).map((x: any) => x.user_id) as string[];

  // ✅ user_profiles 기준 통일
  const { data: profiles, error: pErr } = await supabase
    .from('user_profiles')
    .select('user_id,display_name')
    .in('user_id', userIds);

  if (pErr) throw pErr;

  const nameMap = new Map<string, string>();
  for (const p of (profiles as any) || []) nameMap.set(p.user_id, p.display_name ?? '사용자');

  const mRows = ((members as any) || []) as Member[];
  for (const m of mRows) m.display_name = nameMap.get(m.user_id) ?? '사용자';

  const { data: statuses, error: sErr } = await supabase
    .from('shared_routine_daily_status')
    .select('room_id,user_id,date_key,status,created_at')
    .eq('room_id', roomId)
    .eq('date_key', dateKey);

  if (sErr) throw sErr;

  return { members: mRows, statuses: ((statuses as any) || []) as DailyStatus[] };
}

/**
 * 히트맵용 기간 상태 조회
 */
export async function fetchStatusesRange(roomId: string, fromKey: string, toKey: string) {
  const { data, error } = await supabase
    .from('shared_routine_daily_status')
    .select('room_id,user_id,date_key,status,created_at')
    .eq('room_id', roomId)
    .gte('date_key', fromKey)
    .lte('date_key', toKey);

  if (error) throw error;
  return ((data as any) || []) as DailyStatus[];
}
