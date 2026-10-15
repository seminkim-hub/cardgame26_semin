const 스프레드시트_ID = "1a1Pk1OVeyOZzsIcrmExtK-odx0gGKqEXKjLrqL8SV84";
const 시트_이름 = "시트1";
const 헤더 = ["timestamp", "name", "score", "finishtime"];

/** 저장된 빠른 기록을 조회합니다. */
function doGet() {
  const 잠금 = LockService.getScriptLock();

  try {
    잠금.waitLock(10000);
    const 시트 = 기록시트가져오기();
    return 응답({ success: true, leaderboard: 빠른기록조회(시트) });
  } catch (오류) {
    return 응답({
      success: false,
      message: 오류 && 오류.message ? 오류.message : "순위를 불러오지 못했습니다.",
    });
  } finally {
    if (잠금.hasLock()) 잠금.releaseLock();
  }
}

/** 게임 완료 기록을 저장하고, 완료 시간이 빠른 상위 3개 기록을 반환합니다. */
function doPost(e) {
  const 잠금 = LockService.getScriptLock();

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("요청 데이터가 비어 있습니다.");
    }

    const 기록 = JSON.parse(e.postData.contents);

    const 이름 = typeof 기록.name === "string" ? 기록.name.trim() : "";
    const 시도횟수 = Number(기록.score);
    const 완료시간 = typeof 기록.finishtime === "string" ? 기록.finishtime : "";

    if (!이름 || 이름.length > 16 || /[\u0000-\u001f\u007f]/.test(이름)) {
      throw new Error("이름은 1자 이상 16자 이하로 입력해야 합니다.");
    }
    if (!Number.isInteger(시도횟수) || 시도횟수 < 1 || 시도횟수 > 10000) {
      throw new Error("시도 횟수 데이터가 올바르지 않습니다.");
    }
    if (!/^\d{2,}:[0-5]\d$/.test(완료시간)) {
      throw new Error("완료 시간 형식이 올바르지 않습니다.");
    }

    const 시트 = 기록시트가져오기();

    잠금.waitLock(10000);
    // 이름이 수식으로 실행되지 않도록 수식 시작 문자를 텍스트로 저장합니다.
    const 시트용이름 = /^[=+\-@]/.test(이름) ? "'" + 이름 : 이름;
    시트.appendRow([new Date(), 시트용이름, 시도횟수]);
    const 마지막행 = 시트.getLastRow();
    시트.getRange(마지막행, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
    const 완료시간셀 = 시트.getRange(마지막행, 4);
    완료시간셀.setNumberFormat("@");
    완료시간셀.setValue(완료시간);

    // 기록 추가와 순위 조회를 같은 잠금 안에서 처리해 동시 완료 시 순위를 일관되게 반환합니다.
    const 순위 = 빠른기록조회(시트);

    return 응답({
      success: true,
      message: "게임 기록을 저장하고 빠른 기록 순위를 불러왔습니다.",
      leaderboard: 순위,
    });
  } catch (오류) {
    return 응답({
      success: false,
      message: 오류 && 오류.message ? 오류.message : "게임 기록을 저장하지 못했습니다.",
    });
  } finally {
    if (잠금.hasLock()) 잠금.releaseLock();
  }
}

function 기록시트가져오기() {
  const 문서 = SpreadsheetApp.openById(스프레드시트_ID);
  const 시트 = 문서.getSheetByName(시트_이름);
  if (!시트) {
    throw new Error("시트 탭 '시트1'을 찾지 못했습니다.");
  }

  const 실제헤더 = 시트.getRange(1, 1, 1, 헤더.length).getDisplayValues()[0];
  if (헤더.some((항목, 위치) => 실제헤더[위치] !== 항목)) {
    throw new Error("첫 번째 행의 열 이름을 timestamp, name, score, finishtime 순서로 확인해주세요.");
  }

  return 시트;
}

/** 시트 기록을 종료 시간 오름차순으로 정렬해 상위 3개를 반환합니다. */
function 빠른기록조회(시트) {
  const 마지막행 = 시트.getLastRow();
  if (마지막행 < 2) return [];

  const 행들 = 시트.getRange(2, 1, 마지막행 - 1, 헤더.length).getValues();
  const 시간대 = 시트.getParent().getSpreadsheetTimeZone();
  const 기록들 = 행들
    .map((행, 인덱스) => {
      const 이름 = String(행[1] ?? "").trim().replace(/^'(?=[=+\-@])/, "");
      const 초 = 완료시간초(행[3], 시간대);
      const 완료시간 = 초 === null ? "" : 초를완료시간으로표시(초);

      return {
        name: 이름,
        score: Number(행[2]),
        finishtime: 완료시간,
        초,
        시트행: 인덱스,
      };
    })
    .filter((기록) => 기록.name && 기록.초 !== null);

  기록들.sort((가, 나) => 가.초 - 나.초 || 가.시트행 - 나.시트행);

  return 기록들.slice(0, 3).map((기록, 인덱스) => ({
    rank: 인덱스 + 1,
    name: 기록.name,
    score: Number.isInteger(기록.score) ? 기록.score : 0,
    finishtime: 기록.finishtime,
  }));
}

function 완료시간초(값, 시간대) {
  if (값 instanceof Date && !Number.isNaN(값.getTime())) {
    const 시간문자열 = Utilities.formatDate(값, 시간대, "HH:mm:ss");
    const 일치 = /^(\d{1,}):([0-5]\d):([0-5]\d)$/.exec(시간문자열);
    if (!일치) return null;
    // 시트가 MM:SS 문자열을 시각으로 바꾼 경우 시=분, 분=초로 복원합니다.
    return Number(일치[1]) * 60 + Number(일치[2]);
  }

  if (typeof 값 === "number" && Number.isFinite(값)) {
    const 하루의분 = Math.round((값 % 1) * 24 * 60);
    return Math.floor(하루의분 / 60) * 60 + (하루의분 % 60);
  }

  const 시간 = String(값 ?? "").trim();
  const 분초 = /^(\d{1,}):([0-5]\d)$/.exec(시간);
  if (분초) return Number(분초[1]) * 60 + Number(분초[2]);

  const 시분초 = /^(\d{1,}):([0-5]\d):([0-5]\d)$/.exec(시간);
  if (시분초) return Number(시분초[1]) * 60 + Number(시분초[2]);

  const 오전오후 = /^(\d{1,2}):([0-5]\d):([0-5]\d)\s*(AM|PM)$/i.exec(시간);
  if (오전오후) {
    const 시간값 = Number(오전오후[1]) % 12 + (오전오후[4].toUpperCase() === "PM" ? 12 : 0);
    return 시간값 * 60 + Number(오전오후[2]);
  }

  return null;
}

function 초를완료시간으로표시(초) {
  const 분 = Math.floor(초 / 60);
  const 나머지초 = 초 % 60;
  return String(분).padStart(2, "0") + ":" + String(나머지초).padStart(2, "0");
}

function 응답(내용) {
  return ContentService
    .createTextOutput(JSON.stringify(내용))
    .setMimeType(ContentService.MimeType.JSON);
}
