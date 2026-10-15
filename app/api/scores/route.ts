type ScoreSubmission = {
  name?: unknown;
  score?: unknown;
  finishtime?: unknown;
};

type LeaderboardEntry = {
  rank: number;
  name: string;
  score: number;
  finishtime: string;
};

function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  if (value === null || typeof value !== "object") return false;
  const entry = value as Partial<LeaderboardEntry>;
  return (
    Number.isInteger(entry.rank) &&
    typeof entry.name === "string" &&
    Number.isInteger(entry.score) &&
    typeof entry.finishtime === "string" &&
    /^\d{2,}:[0-5]\d$/.test(entry.finishtime)
  );
}

function jsonError(message: string, status: number) {
  return Response.json({ success: false, message }, { status });
}

function getScriptUrl(): { ok: true; url: URL } | { ok: false; response: Response } {
  const scriptUrl = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;
  if (!scriptUrl) return { ok: false, response: jsonError("구글 시트 저장 설정이 필요합니다. 관리자에게 문의해주세요.", 503) };

  try {
    const parsedUrl = new URL(scriptUrl);
    if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "script.google.com") {
      return { ok: false, response: jsonError("구글 앱스 스크립트 주소 설정이 올바르지 않습니다.", 500) };
    }
    return { ok: true, url: parsedUrl };
  } catch {
    return { ok: false, response: jsonError("구글 앱스 스크립트 주소 설정이 올바르지 않습니다.", 500) };
  }
}

async function readLeaderboard(response: Response, 기록저장완료 = false): Promise<
  { ok: true; leaderboard: LeaderboardEntry[] } | { ok: false; response: Response }
> {
  const responseText = await response.text();
  let result: { success?: boolean; message?: string; leaderboard?: unknown };
  try {
    result = JSON.parse(responseText) as { success?: boolean; message?: string; leaderboard?: unknown };
  } catch {
    const message = responseText.includes("doGet")
      ? "현재 Apps Script 배포에 doGet 순위 조회 기능이 없습니다. 최신 Code.gs를 저장하고 기존 웹 앱 배포를 새 버전으로 업데이트해주세요."
      : "Apps Script가 JSON 응답을 보내지 않았습니다. 최신 Code.gs와 웹 앱 액세스 권한이 배포됐는지 확인해주세요.";
    return { ok: false, response: jsonError(message, 502) };
  }

  if (!response.ok || result.success !== true) {
    const message = result.message === "저장 권한을 확인할 수 없습니다."
      ? "Apps Script가 이전 버전으로 배포되어 있습니다. 최신 Code.gs를 저장하고 기존 웹 앱 배포를 새 버전으로 업데이트해주세요."
      : result.message || "구글 시트 순위를 불러오지 못했습니다.";
    return { ok: false, response: jsonError(message, 502) };
  }
  if (!Array.isArray(result.leaderboard) || result.leaderboard.length > 3 || !result.leaderboard.every(isLeaderboardEntry)) {
    const message = 기록저장완료
      ? "게임 기록은 저장됐지만 순위 응답이 없습니다. Apps Script 최신 코드를 저장하고 기존 웹 앱 배포를 새 버전으로 업데이트해주세요."
      : "순위 응답 형식이 올바르지 않습니다. Apps Script를 최신 버전으로 배포해주세요.";
    return { ok: false, response: jsonError(message, 502) };
  }

  return { ok: true, leaderboard: result.leaderboard };
}

export async function GET() {
  const endpoint = getScriptUrl();
  if (!endpoint.ok) return endpoint.response;

  try {
    const upstream = await fetch(endpoint.url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const result = await readLeaderboard(upstream);
    if (!result.ok) return result.response;

    return Response.json({ success: true, leaderboard: result.leaderboard });
  } catch {
    return jsonError("구글 시트에 연결하지 못했습니다. 잠시 후 다시 확인해주세요.", 502);
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("점수 데이터 형식이 올바르지 않습니다.", 400);
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("점수 데이터 형식이 올바르지 않습니다.", 400);
  }
  const submission = body as ScoreSubmission;

  const name = typeof submission.name === "string" ? submission.name.trim() : "";
  const score = submission.score;
  const finishtime = submission.finishtime;

  if (!name || name.length > 16 || /[\u0000-\u001f\u007f]/.test(name)) {
    return jsonError("이름은 1자 이상 16자 이하로 입력해야 합니다.", 400);
  }
  if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 10000) {
    return jsonError("시도 횟수 데이터가 올바르지 않습니다.", 400);
  }
  if (typeof finishtime !== "string" || !/^\d{2,}:([0-5]\d)$/.test(finishtime)) {
    return jsonError("완료 시간 형식이 올바르지 않습니다.", 400);
  }

  const endpoint = getScriptUrl();
  if (!endpoint.ok) return endpoint.response;

  try {
    const upstream = await fetch(endpoint.url, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ name, score, finishtime }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await readLeaderboard(upstream, true);
    if (!result.ok) return result.response;

    return Response.json({
      success: true,
      message: "게임 기록을 저장하고 빠른 기록 순위를 불러왔습니다.",
      leaderboard: result.leaderboard,
    });
  } catch {
    return jsonError("구글 시트에 연결하지 못했습니다. 잠시 후 다시 확인해주세요.", 502);
  }
}
