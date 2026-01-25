// supabase/functions/delete-account/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, any>;

function json(status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });
  if (req.method !== "POST") return json(405, { ok: false, message: "Method not allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, {
      ok: false,
      message: "Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    });
  }

  // ✅ Authorization 헤더 필수
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { ok: false, message: "Missing Authorization Bearer token" });
  }

  // ✅ 요청 바디에서 최종 확인 플래그 받기 (실수 방지용)
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body?.confirm !== true) {
    return json(400, { ok: false, message: "confirm=true is required" });
  }

  // 1) 요청자 검증(유저 토큰으로 getUser)
  //    anon 키 없이도 getUser는 가능하지만, supabase-js는 key가 필요하므로 service role로 만들고
  //    Authorization을 글로벌 헤더로 넣어 getUser를 호출한다.
  const authed = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await authed.auth.getUser();
  const user = userData?.user;

  if (userErr || !user?.id) {
    return json(401, { ok: false, message: "Invalid token or user not found" });
  }

  // 2) 관리자 권한 클라이언트 (Service Role)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const uid = user.id;

  // 3) public 데이터 정리 (테이블명은 네 앱 기준으로 안전하게)
  //    - 존재하지 않는 테이블이면 에러가 나므로, try/catch로 “있으면 지우고 없으면 무시”
  //    - 너 프로젝트에서 쓰던 테이블: profiles(user_id), routines(user_id), daily_logs(user_id)
  //    - 추가로 있으면 여기에 더 넣어도 됨
  try {
    await admin.from("daily_logs").delete().eq("user_id", uid);
  } catch (_) {}

  try {
    await admin.from("routines").delete().eq("user_id", uid);
  } catch (_) {}

  try {
    await admin.from("profiles").delete().eq("user_id", uid);
  } catch (_) {}

  // 4) 최종: auth 사용자 삭제
  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) {
    return json(500, { ok: false, message: delErr.message });
  }

  return json(200, { ok: true });
});
