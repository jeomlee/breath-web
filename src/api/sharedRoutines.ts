// src/api/sharedRoutines.ts
import dayjs from 'dayjs';
import { supabase } from './supabaseClient';

function safeArray<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export type SharedRoom = {
  id: string;
  routine_id: string;
  owner_id: string;
  join_code: string;
  is_active: boolean;
  created_at: string;

  routine_title?: string;
  my_role?: 'owner' | 'member' | string;

  total_members?: number;
};

export type Member = {
  room_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;

  // 방 전용 닉네임
  display_name?: string | null;

  // profiles에서 내려오는 값(참고)
  email?: string | null;
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

function isDuplicateErr(e: any) {
  if (!e) return false;
  if (e.code === '23505') return true;
  const msg = String(e.message ?? '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('unique');
}

/** =========================
 * Rooms
 ========================= */

export async function getRoomById(roomId: string) {
  const { data, error } = await supabase
    .from('shared_routine_rooms')
    .select('id,routine_id,owner_id,join_code,is_active,created_at,routine_title')
    .eq('id', roomId)
    .maybeSingle();

  if (error) throw error;
  return (data as any as SharedRoom) ?? null;
}

export async function getRoomByRoutineId(routineId: string) {
  const { data, error } = await supabase
    .from('shared_routine_rooms')
    .select('id,routine_id,owner_id,join_code,is_active,created_at,routine_title')
    .eq('routine_id', routineId)
    .maybeSingle();

  if (error) throw error;
  return (data as any as SharedRoom) ?? null;
}

/**
 * 내 기록 공유(방 생성 or 기존 방 반환)
 * - routine_title 스냅샷 저장
 */
export async function ensureRoomForRoutine(routineId: string) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('로그인이 필요합니다.');

  const existing = await getRoomByRoutineId(routineId);
  if (existing) {
    // owner 멤버십 보장
    const { error: mErr } = await supabase.from('shared_routine_members').insert({
      room_id: existing.id,
      user_id: user.id,
      role: 'owner',
    });
    if (mErr && !isDuplicateErr(mErr)) throw mErr;
    return existing;
  }

  let routine_title = '기록';
  try {
    const { data: r1 } = await supabase.from('routines').select('title').eq('id', routineId).maybeSingle();
    const t = (r1 as any)?.title;
    if (t && String(t).trim()) routine_title = String(t).trim();
  } catch {}

  let lastErr: any = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    const join_code = genCode();

    const { data: room, error } = await supabase
      .from('shared_routine_rooms')
      .insert({
        routine_id: routineId,
        owner_id: user.id,
        join_code,
        is_active: true,
        routine_title,
      })
      .select('id,routine_id,owner_id,join_code,is_active,created_at,routine_title')
      .maybeSingle();

    if (error) {
      lastErr = error;
      if (isDuplicateErr(error)) continue;
      throw error;
    }

    const { error: mErr } = await supabase.from('shared_routine_members').insert({
      room_id: (room as any).id,
      user_id: user.id,
      role: 'owner',
    });

    if (mErr && !isDuplicateErr(mErr)) throw mErr;

    return room as any as SharedRoom;
  }

  throw lastErr ?? new Error('공유 기록 생성에 실패하였습니다.');
}

export async function findRoomByCode(code: string) {
  const c = code.trim().toUpperCase();
  const { data, error } = await supabase
    .from('shared_routine_rooms')
    .select('id,routine_id,owner_id,join_code,is_active,created_at,routine_title')
    .eq('join_code', c)
    .maybeSingle();

  if (error) throw error;
  return (data as any as SharedRoom) ?? null;
}

export async function joinRoom(roomId: string) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('로그인이 필요합니다.');

  // 방이 비활성(종료)면 참여 금지
  const room = await getRoomById(roomId);
  if (!room) throw new Error('공유 호흡을 찾을 수 없습니다.');
  if (room.is_active === false) throw new Error('종료된 공유 호흡입니다.');

  const { error } = await supabase.from('shared_routine_members').insert({
    room_id: roomId,
    user_id: user.id,
    role: 'member',
  });

  if (error) {
    if (isDuplicateErr(error)) return;
    throw error;
  }
}

/**
 * ✅ 내 공유방 목록 (+role + 참여자 수)
 */
export async function fetchMySharedRooms() {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('로그인이 필요합니다.');

  const { data: ms, error: mErr } = await supabase
    .from('shared_routine_members')
    .select('room_id,role')
    .eq('user_id', user.id);

  if (mErr) throw mErr;

  const msRows = safeArray<any>(ms);
  const roomIds = msRows.map((x) => x.room_id).filter(Boolean) as string[];
  if (roomIds.length === 0) return [] as SharedRoom[];

  const { data: rooms, error: rErr } = await supabase
    .from('shared_routine_rooms')
    .select('id,routine_id,owner_id,join_code,is_active,created_at,routine_title')
    .in('id', roomIds)
    .order('created_at', { ascending: false });

  if (rErr) throw rErr;

  const roleMap = new Map<string, string>();
  for (const row of msRows) roleMap.set(String(row.room_id), row.role ?? 'member');

  const { data: allMembers, error: allMErr } = await supabase
    .from('shared_routine_members')
    .select('room_id')
    .in('room_id', roomIds);

  if (allMErr) throw allMErr;

  const countMap = new Map<string, number>();
  for (const row of safeArray<any>(allMembers)) {
    const rid = row?.room_id;
    if (!rid) continue;
    countMap.set(String(rid), (countMap.get(String(rid)) ?? 0) + 1);
  }

  return safeArray<any>(rooms).map((x: any) => ({
    ...x,
    routine_title: x?.routine_title && String(x.routine_title).trim() ? String(x.routine_title).trim() : '기록',
    my_role: roleMap.get(String(x.id)) ?? 'member',
    total_members: countMap.get(String(x.id)) ?? 0,
  })) as SharedRoom[];
}

/** =========================
 * Status
 ========================= */

export async function upsertTodayStatus(roomId: string, status: 'focus' | 'rest') {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('로그인이 필요합니다.');

  const room = await getRoomById(roomId);
  if (!room) throw new Error('공유 호흡을 찾을 수 없습니다.');
  if (room.is_active === false) throw new Error('종료된 공유 호흡입니다.');

  const date_key = dayjs().format('YYYY-MM-DD');

  const { error } = await supabase.from('shared_routine_daily_status').upsert(
    { room_id: roomId, user_id: user.id, date_key, status },
    { onConflict: 'room_id,user_id,date_key' }
  );

  if (error) throw error;
}

/**
 * ✅ board: members(+방닉네임) + 오늘 status
 */
export async function fetchBoard(roomId: string, dateKey: string) {
  const { data: members, error: mErr } = await supabase
    .from('shared_routine_members')
    .select('room_id,user_id,role,joined_at,display_name')
    .eq('room_id', roomId);

  if (mErr) throw mErr;

  const mRows = safeArray<any>(members) as Member[];

  const userIds = mRows.map((x: any) => x.user_id).filter(Boolean);
  const uniq = Array.from(new Set(userIds)).slice(0, 500);

  // profiles 참고: email/표시명
  let profiles: any[] = [];
  if (uniq.length > 0) {
    const { data: p, error: pErr } = await supabase
      .from('profiles')
      .select('user_id,email,display_name,nickname')
      .in('user_id', uniq);

    if (!pErr) profiles = safeArray<any>(p);
  }

  const infoMap = new Map<string, { email?: string; display_name?: string }>();
  for (const p of profiles) {
    const email = (p?.email ?? '').trim() || undefined;
    const dn = (p?.display_name ?? '').trim() || (p?.nickname ?? '').trim() || undefined;
    if (p?.user_id) infoMap.set(String(p.user_id), { email, display_name: dn });
  }

  for (const m of mRows) {
    const info = infoMap.get(String(m.user_id));
    m.email = info?.email ?? null;

    // 방닉네임 우선. 없으면 profiles 표시명으로 채움
    const roomNick = String(m.display_name ?? '').trim();
    if (!roomNick) {
      const dn = String(info?.display_name ?? '').trim();
      if (dn) m.display_name = dn;
    }
  }

  const { data: statuses, error: sErr } = await supabase
    .from('shared_routine_daily_status')
    .select('room_id,user_id,date_key,status,created_at')
    .eq('room_id', roomId)
    .eq('date_key', dateKey);

  if (sErr) throw sErr;

  return {
    members: mRows,
    statuses: safeArray<any>(statuses) as DailyStatus[],
  };
}

export async function fetchStatusesRange(roomId: string, fromKey: string, toKey: string) {
  const { data, error } = await supabase
    .from('shared_routine_daily_status')
    .select('room_id,user_id,date_key,status,created_at')
    .eq('room_id', roomId)
    .gte('date_key', fromKey)
    .lte('date_key', toKey);

  if (error) throw error;
  return safeArray<any>(data) as DailyStatus[];
}

/**
 * ✅ 방 전용 닉네임 저장
 */
export async function updateMyRoomDisplayName(roomId: string, displayName: string) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('로그인이 필요합니다.');

  const t = displayName.trim();
  if (!t) throw new Error('닉네임을 입력해 주세요.');

  const { error } = await supabase
    .from('shared_routine_members')
    .update({ display_name: t })
    .eq('room_id', roomId)
    .eq('user_id', user.id);

  if (error) throw error;
}

/** =========================
 * Room lifecycle (정책 반영)
 *
 * ✅ 방장 삭제 불가
 * ✅ 모두 나가서 참여자 0명일 때만 시스템이 자동 정리(GC)
 * ✅ 방장이 나갈 때, 다른 멤버가 있으면 가장 오래된 멤버에게 자동 위임
 ========================= */

/** 내부: 방장 위임(가장 오래된 멤버에게) */
async function autoTransferOwnershipIfNeeded(roomId: string, leavingUserId: string) {
  // 현재 room 확인
  const room = await getRoomById(roomId);
  if (!room) return;

  // 방장이 아니면 할 일 없음
  if (String(room.owner_id) !== String(leavingUserId)) return;

  // 남아있는 멤버(나가는 사람 제외) 중 가장 오래된 사람 찾기
  const { data: others, error: oErr } = await supabase
    .from('shared_routine_members')
    .select('user_id,joined_at')
    .eq('room_id', roomId)
    .neq('user_id', leavingUserId)
    .order('joined_at', { ascending: true })
    .limit(1);

  if (oErr) throw oErr;

  const successorId = safeArray<any>(others)[0]?.user_id;
  if (!successorId) {
    // 혼자였던 방장(후계자 없음) → 그냥 leave 진행 (이후 0명되면 GC가 방 삭제)
    return;
  }

  // rooms.owner_id 업데이트
  {
    const { error } = await supabase.from('shared_routine_rooms').update({ owner_id: successorId }).eq('id', roomId);
    if (error) throw error;
  }

  // successor role=owner
  {
    const { error } = await supabase
      .from('shared_routine_members')
      .update({ role: 'owner' })
      .eq('room_id', roomId)
      .eq('user_id', successorId);
    if (error) throw error;
  }
}

/** 내부: 참여자 0명일 때만 방 자동 정리(GC) */
async function gcRoomIfEmpty(roomId: string) {
  // head:true면 data가 비거나 null일 수 있어서 count를 사용
  const { count, error: cErr } = await supabase
    .from('shared_routine_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('room_id', roomId);

  if (cErr) throw cErr;

  const n = typeof count === 'number' ? count : 0;
  if (n !== 0) return;

  // ✅ 아무도 없으면만 정리
  try {
    await supabase.from('shared_routine_daily_status').delete().eq('room_id', roomId);
  } catch {}
  try {
    await supabase.from('shared_routine_rooms').delete().eq('id', roomId);
  } catch {}
}

/**
 * ✅ 나가기 (멤버/방장 공통)
 * - 방장이면 자동 위임 후 나감
 * - 나간 뒤 0명이면 시스템 GC로 room/status 정리
 */
export async function leaveRoom(roomId: string) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('로그인이 필요합니다.');

  // 1) 방장이면 먼저 위임(다른 멤버가 있으면)
  await autoTransferOwnershipIfNeeded(roomId, user.id);

  // 2) 멤버십 삭제
  const { error: leaveErr } = await supabase
    .from('shared_routine_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', user.id);

  if (leaveErr) throw leaveErr;

  // 3) 0명일 때만 자동 정리
  await gcRoomIfEmpty(roomId);
}

/** 방 종료(비활성화) - 방장만 */
export async function closeRoom(roomId: string) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('로그인이 필요합니다.');

  const room = await getRoomById(roomId);
  if (!room) throw new Error('공유 호흡을 찾을 수 없습니다.');
  if (room.owner_id !== user.id) throw new Error('방장만 종료할 수 있습니다.');

  const { error } = await supabase.from('shared_routine_rooms').update({ is_active: false }).eq('id', roomId);
  if (error) throw error;
}

/** 종료된 방 다시 살리기(재개) - 방장만 */
export async function reopenRoom(roomId: string) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('로그인이 필요합니다.');

  const room = await getRoomById(roomId);
  if (!room) throw new Error('공유 호흡을 찾을 수 없습니다.');
  if (room.owner_id !== user.id) throw new Error('방장만 재개할 수 있습니다.');

  const { error } = await supabase.from('shared_routine_rooms').update({ is_active: true }).eq('id', roomId);
  if (error) throw error;
}

/**
 * ❌ 방 삭제는 앱 정책상 금지 (방장이라도 불가)
 * - 방은 "참여자 0명"일 때만 시스템 GC로 자동 정리됨
 */
export async function deleteRoom(_roomId: string) {
  throw new Error('공유 호흡은 삭제할 수 없습니다. (참여자 0명일 때 자동 정리됩니다)');
}

/** ✅ 화면에서 SR로 쓰던 방식 유지용 */
export const apiSharedRoutines = {
  getRoomById,
  getRoomByRoutineId,
  ensureRoomForRoutine,
  findRoomByCode,
  joinRoom,
  fetchMySharedRooms,
  upsertTodayStatus,
  fetchBoard,
  fetchStatusesRange,
  updateMyRoomDisplayName,
  leaveRoom,
  closeRoom,
  reopenRoom,
  deleteRoom, // (호출하면 에러 던짐)
};
