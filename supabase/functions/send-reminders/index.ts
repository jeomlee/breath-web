// supabase/functions/send-reminders/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

type Row = {
  user_id: string;
  after_days: number;
  message: string;
  last_notified_at: string | null;
  expo_push_token: string | null;
  last_opened_at: string | null;
};

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

serve(async (req) => {
  try {
    // (선택) 외부에서 함수를 직접 호출할 수도 있으니 간단 보호
    // Supabase Scheduled Trigger로만 돌릴 거면 없어도 됨.
    // const auth = req.headers.get("authorization") ?? "";
    // if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const now = new Date();

    // ✅ 후보 사용자 로드
    // 조건:
    // - reminder_settings.is_enabled = true
    // - expo_push_token 존재
    // - last_opened_at 존재
    // - last_opened_at <= now - after_days
    // - last_notified_at 이 null 이거나, last_notified_at < last_opened_at (앱 재접속 후엔 다시 알림 가능)
    //
    // 주의: Supabase SQL에서 조인 직접을 view 없이 하려면 rpc나 view가 편함.
    // 여기서는 "view" 하나 만들어 두는 방식이 가장 깔끔.
    //
    // ✅ 아래는 "view 사용" 버전. (추천)
    const { data: rows, error } = await supabase
      .from("v_reminder_candidates")
      .select("user_id, after_days, message, last_notified_at, expo_push_token, last_opened_at");

    if (error) throw error;

    const candidates = (rows ?? []) as Row[];

    // JS에서 최종 필터 (시간 계산 정확히)
    const targets = candidates.filter((r) => {
      if (!r.expo_push_token) return false;
      if (!r.last_opened_at) return false;
      if (!r.message?.trim()) return false;

      const afterDays = r.after_days === 5 ? 5 : 3;
      const lastOpened = new Date(r.last_opened_at);
      const threshold = new Date(now.getTime() - afterDays * 24 * 60 * 60 * 1000);

      if (lastOpened > threshold) return false;

      if (!r.last_notified_at) return true;

      const lastNotified = new Date(r.last_notified_at);
      // 앱을 한번이라도 다시 열면(last_opened_at 갱신) 알림 “재무장”
      return lastNotified < lastOpened;
    });

    if (targets.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { "content-type": "application/json" },
      });
    }

    // ✅ Expo Push payload
    const messages = targets.map((t) => ({
      to: t.expo_push_token!,
      title: "Breath",
      body: t.message.trim(),
      sound: "default",
      data: { kind: "reminder" },
    }));

    // Expo는 한 번에 너무 많이 보내지 말고 적당히 쪼개는 게 안전
    const batches = chunk(messages, 100);

    let sent = 0;
    for (const batch of batches) {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // (선택) Expo Access Token 쓰면 아래 추가
          // "authorization": `Bearer ${Deno.env.get("EXPO_ACCESS_TOKEN")}`,
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("Expo push failed:", txt);
        continue;
      }

      const json = await res.json();
      // 성공/실패 섞여있을 수 있음. 일단 요청 단위로 sent 증가
      sent += batch.length;
      console.log("Expo response:", json);
    }

    // ✅ 발송 처리한 유저의 last_notified_at 업데이트 (1회 발송 보장)
    const userIds = [...new Set(targets.map((t) => t.user_id))];

    const { error: upErr } = await supabase
      .from("reminder_settings")
      .update({ last_notified_at: now.toISOString(), updated_at: now.toISOString() })
      .in("user_id", userIds);

    if (upErr) throw upErr;

    return new Response(JSON.stringify({ ok: true, sent, users: userIds.length }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
