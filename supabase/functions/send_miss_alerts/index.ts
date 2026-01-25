import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type DailyStatusRow = {
  room_id: string;
  user_id: string;
  date_key: string; // YYYY-MM-DD
  status: "focus" | "rest";
};

function makeKeysDesc(days: number) {
  const now = new Date();
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    keys.push(`${y}-${m}-${dd}`);
  }
  return keys; // today -> past
}

function calcMissStreak(keysDesc: string[], checkedSet: Set<string>) {
  let streak = 0;
  for (const k of keysDesc) {
    if (checkedSet.has(k)) break; // 오늘부터 연속으로 비어있는 날짜 수
    streak += 1;
  }
  return streak;
}

function levelOf(streak: number) {
  if (streak >= 14) return 14;
  if (streak >= 7) return 7;
  if (streak >= 3) return 3;
  return 0;
}

async function sendExpoPush(token: string, title: string, body: string) {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: token,
      title,
      body,
      sound: null,
    }),
  });
  return res.ok;
}

serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const LOOKBACK = 56;
  const keysDesc = makeKeysDesc(LOOKBACK);
  const fromKey = keysDesc[keysDesc.length - 1]; // oldest
  const toKey = keysDesc[0]; // today

  const { data: rooms, error: rErr } = await supabase
    .from("shared_routine_rooms")
    .select("id,is_active");

  if (rErr) return new Response(JSON.stringify({ ok: false, error: rErr.message }), { status: 500 });

  for (const room of rooms ?? []) {
    if (room.is_active === false) continue;

    const roomId = room.id as string;

    const { data: members, error: mErr } = await supabase
      .from("shared_routine_members")
      .select("user_id")
      .eq("room_id", roomId);

    if (mErr) continue;
    if (!members || members.length === 0) continue;

    const userIds = members.map((x) => x.user_id);

    const { data: statuses, error: sErr } = await supabase
      .from("shared_routine_daily_status")
      .select("room_id,user_id,date_key,status")
      .eq("room_id", roomId)
      .gte("date_key", fromKey)
      .lte("date_key", toKey);

    if (sErr) continue;

    // ✅ 토큰: user_profiles
    const { data: prof, error: pErr } = await supabase
      .from("user_profiles")
      .select("user_id,expo_push_token")
      .in("user_id", userIds);

    if (pErr) continue;

    const tokenMap = new Map<string, string>();
    for (const row of prof ?? []) {
      if (row.expo_push_token) tokenMap.set(row.user_id, row.expo_push_token);
    }

    // last_notified_level
    const { data: stats, error: stErr } = await supabase
      .from("shared_routine_member_stats")
      .select("user_id,last_notified_level")
      .eq("room_id", roomId);

    if (stErr) {
      // stats 없으면 그냥 진행은 하되 lastLevel=0으로 처리
    }

    const lastLevelMap = new Map<string, number>();
    for (const row of stats ?? []) lastLevelMap.set(row.user_id, row.last_notified_level ?? 0);

    for (const uid of userIds) {
      const checked = new Set<string>();
      for (const s of (statuses as unknown as DailyStatusRow[]) ?? []) {
        if (s.user_id === uid) checked.add(s.date_key);
      }

      const streak = calcMissStreak(keysDesc, checked);
      const level = levelOf(streak);
      const last = lastLevelMap.get(uid) ?? 0;

      // stats upsert (항상 갱신)
      await supabase.from("shared_routine_member_stats").upsert({
        room_id: roomId,
        user_id: uid,
        miss_streak: streak,
        last_notified_level: last,
        updated_at: new Date().toISOString(),
      });

      // 체크가 있으면 알림 레벨 리셋
      if (level === 0) {
        if (last !== 0) {
          await supabase.from("shared_routine_member_stats").upsert({
            room_id: roomId,
            user_id: uid,
            miss_streak: streak,
            last_notified_level: 0,
            updated_at: new Date().toISOString(),
          });
        }
        continue;
      }

      // 같은 레벨 중복 발송 금지
      if (level === last) continue;

      const token = tokenMap.get(uid);
      if (!token) continue;

      const title = "기록이 비어 있습니다";
      const body =
        level === 3
          ? `최근 ${streak}일 동안 기록이 없었습니다. 오늘 상태를 체크해 주세요.`
          : level === 7
          ? `최근 ${streak}일 동안 기록이 없었습니다. 부담 없이 상태만 남겨 주세요.`
          : `최근 ${streak}일 동안 기록이 없었습니다. 다시 시작하실 수 있도록 도와드리겠습니다.`;

      const ok = await sendExpoPush(token, title, body);
      if (ok) {
        await supabase.from("shared_routine_member_stats").upsert({
          room_id: roomId,
          user_id: uid,
          miss_streak: streak,
          last_notified_level: level,
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
