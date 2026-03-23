import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const catalog = [
  {
    id: "scarcity",
    title: "경제는 왜 항상 '부족함'에서 시작할까?",
    summary: "희소성과 선택의 출발점을 학교생활과 시간 관리 예시로 설명한다.",
    keyTerms: ["희소성", "자원", "선택", "우선순위"],
  },
  {
    id: "opportunity-cost",
    title: "하나를 고르면 다른 하나를 포기해야 하는 이유는 뭘까?",
    summary: "기회비용을 학생의 시간, 용돈, 선택 상황으로 풀어낸다.",
    keyTerms: ["기회비용", "선택", "포기", "대가"],
  },
  {
    id: "consumer-choice-and-budget",
    title: "용돈이 정해져 있으면 소비 선택은 어떻게 달라질까?",
    summary: "예산 제약이 소비 우선순위와 선택을 어떻게 바꾸는지 보여 준다.",
    keyTerms: ["예산", "소비", "선택", "우선순위"],
  },
  {
    id: "demand-and-supply",
    title: "수요와 공급은 왜 가격을 움직일까?",
    summary: "사고 싶어 하는 사람 수와 팔려는 양이 가격을 바꾸는 원리를 설명한다.",
    keyTerms: ["수요", "공급", "가격", "시장"],
  },
  {
    id: "competition-and-choice",
    title: "가게가 많아지면 왜 소비자에게 유리할까?",
    summary: "경쟁이 가격, 품질, 선택권에 어떤 영향을 주는지 설명한다.",
    keyTerms: ["경쟁", "소비자", "가격", "품질"],
  },
  {
    id: "money-functions",
    title: "돈은 왜 그냥 종이가 아니라 '약속'이라고 할까?",
    summary: "돈의 기능을 교환 수단, 가치 저장, 계산 단위로 풀어낸다.",
    keyTerms: ["돈", "교환", "가치저장", "계산단위"],
  },
  {
    id: "inflation-purchasing-power",
    title: "물가가 오르면 왜 같은 돈으로 살 수 있는 게 줄어들까?",
    summary: "인플레이션과 구매력의 관계를 생활 소비 예시로 설명한다.",
    keyTerms: ["물가", "인플레이션", "구매력", "용돈"],
  },
  {
    id: "saving-and-interest",
    title: "저축하면 돈이 조금씩 늘어나는 이유는 뭘까?",
    summary: "저축과 이자가 시간과 연결되는 방식을 설명한다.",
    keyTerms: ["저축", "이자", "은행", "미래"],
  },
  {
    id: "loan-and-interest",
    title: "돈을 빌리면 왜 원금보다 더 많이 갚아야 할까?",
    summary: "대출과 이자의 기본 원리를 학생이 이해할 수 있게 설명한다.",
    keyTerms: ["대출", "이자", "원금", "상환"],
  },
];

const syntheticHistory = [
  {
    run_id: "test-history-money-functions",
    topicId: "money-functions",
    conceptId: "money-functions",
    seriesId: "money-and-finance",
    seriesTitle: "돈과 금융의 흐름",
    seriesOrder: 1,
    curriculumPosition: "금융 1단계: 돈이 왜 필요한지 이해하기",
    narrativeArc: "돈의 역할에서 출발해 물가, 저축, 대출, 환율, 보험으로 확장하는 시리즈",
    teachingAngle: "돈의 기능을 생활 편의를 만든 약속으로 설명한다.",
    title: "돈은 왜 그냥 종이가 아니라 약속일까?",
    summary: "돈의 기능을 교환, 가치 저장, 계산 단위로 설명한 게시물",
    keyTerms: ["돈", "화폐", "교환", "가치저장"],
    publishedAt: "2026-03-20T10:00:00.000Z",
  },
  {
    run_id: "test-history-inflation",
    topicId: "inflation-purchasing-power",
    conceptId: "inflation",
    seriesId: "money-and-finance",
    seriesTitle: "돈과 금융의 흐름",
    seriesOrder: 2,
    curriculumPosition: "금융 2단계: 돈의 가치가 변할 수 있다는 점 이해하기",
    narrativeArc: "돈의 역할에서 출발해 물가, 저축, 대출, 환율, 보험으로 확장하는 시리즈",
    teachingAngle: "인플레이션을 체감 구매력 변화로 설명한다.",
    title: "물가가 오르면 왜 같은 돈으로 덜 살까?",
    summary: "인플레이션과 구매력 관계를 설명한 게시물",
    keyTerms: ["물가", "인플레이션", "구매력", "용돈"],
    publishedAt: "2026-03-21T10:00:00.000Z",
  },
];

function loadEnv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);

    if (!match) {
      continue;
    }

    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "");
  }
}

function normalize(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return [...new Set(normalize(value).split(" ").filter((token) => token.length > 1))];
}

function resolveBaseUrl() {
  const baseUrlArgIndex = process.argv.findIndex((arg) => arg === "--base-url");

  if (baseUrlArgIndex >= 0 && process.argv[baseUrlArgIndex + 1]) {
    return process.argv[baseUrlArgIndex + 1].trim().replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

function resolveMode() {
  const modeArgIndex = process.argv.findIndex((arg) => arg === "--mode");

  if (modeArgIndex >= 0 && process.argv[modeArgIndex + 1]) {
    return process.argv[modeArgIndex + 1].trim();
  }

  return "synthetic";
}

function ensureSyntheticHistory(dataRoot) {
  const dbPath = path.join(dataRoot, "content-history.db");
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS published_content (
      run_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      canonical_topic TEXT NOT NULL,
      source_title TEXT,
      source_summary TEXT,
      caption TEXT NOT NULL,
      permalink TEXT,
      instagram_creation_id TEXT,
      instagram_media_id TEXT,
      published_at TEXT NOT NULL,
      key_terms_json TEXT NOT NULL,
      slide_headlines_json TEXT NOT NULL,
      concept_summary TEXT NOT NULL,
      concept_tokens_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const deleteStmt = db.prepare("DELETE FROM published_content WHERE run_id = ?");
  const insertStmt = db.prepare(`
    INSERT INTO published_content (
      run_id, title, canonical_topic, source_title, source_summary, caption, permalink,
      instagram_creation_id, instagram_media_id, published_at, key_terms_json,
      slide_headlines_json, concept_summary, concept_tokens_json, created_at, updated_at
    ) VALUES (
      $run_id, $title, $canonical_topic, $source_title, $source_summary, $caption, $permalink,
      $instagram_creation_id, $instagram_media_id, $published_at, $key_terms_json,
      $slide_headlines_json, $concept_summary, $concept_tokens_json, $created_at, $updated_at
    )
  `);

  for (const record of syntheticHistory) {
    deleteStmt.run(record.run_id);

    const conceptSummary = [record.title, record.summary, ...record.keyTerms].join(" | ");

    insertStmt.run({
      $run_id: record.run_id,
      $title: record.title,
      $canonical_topic: normalize(record.title),
      $source_title: record.title,
      $source_summary: record.summary,
      $caption: `${record.title} 캡션`,
      $permalink: null,
      $instagram_creation_id: null,
      $instagram_media_id: null,
      $published_at: record.publishedAt,
      $key_terms_json: JSON.stringify(record.keyTerms),
      $slide_headlines_json: JSON.stringify([record.title, record.summary]),
      $concept_summary: conceptSummary,
      $concept_tokens_json: JSON.stringify(tokenize(conceptSummary)),
      $created_at: record.publishedAt,
      $updated_at: record.publishedAt,
    });

    const runDir = path.join(dataRoot, "runs", record.run_id);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, "research-dispatch.json"),
      JSON.stringify(
        {
          selection_metadata: {
            topicId: record.topicId,
            conceptId: record.conceptId,
            seriesId: record.seriesId,
            seriesTitle: record.seriesTitle,
            seriesOrder: record.seriesOrder,
            curriculumPosition: record.curriculumPosition,
            narrativeArc: record.narrativeArc,
            teachingAngle: record.teachingAngle,
            topicAliases: record.keyTerms,
            previousTopicLink: null,
            selectionMode: "heuristic",
            selectionReason: "synthetic history seed",
            selectionScore: 100,
            topSimilarityScore: 0,
            operatorFocus: "synthetic history seed",
            shortlistTopicIds: [record.topicId],
          },
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  db.close();
}

function cleanupSyntheticHistory(dataRoot) {
  const dbPath = path.join(dataRoot, "content-history.db");
  const db = new DatabaseSync(dbPath);
  const deleteStmt = db.prepare("DELETE FROM published_content WHERE run_id = ?");

  for (const record of syntheticHistory) {
    deleteStmt.run(record.run_id);
    fs.rmSync(path.join(dataRoot, "runs", record.run_id), {
      recursive: true,
      force: true,
    });
  }

  db.close();
}

async function postJson(baseUrl, pathname, headers, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`${pathname} failed: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env.local"));

  const baseUrl = resolveBaseUrl();
  const mode = resolveMode();
  const dataRoot = path.join(process.cwd(), ".data");
  fs.mkdirSync(dataRoot, { recursive: true });

  if (mode === "synthetic") {
    ensureSyntheticHistory(dataRoot);
  }

  const operatorHeaders = {
    Authorization: `Bearer ${process.env.RESEARCH_DISPATCH_SECRET}`,
    "x-research-dispatch-secret": process.env.RESEARCH_DISPATCH_SECRET,
    "x-operator-secret": process.env.OPERATOR_API_SECRET,
    "Content-Type": "application/json",
  };

  try {
    let firstClearTopicId = null;

    if (mode === "synthetic") {
      for (const topic of catalog) {
        const similarity = await postJson(
          baseUrl,
          "/api/history/similarity-check",
          { "Content-Type": "application/json" },
          {
            title: topic.title,
            keyTerms: topic.keyTerms,
            summary: topic.summary,
          },
        );

        if (similarity.decision === "clear") {
          firstClearTopicId = topic.id;
          break;
        }
      }
    }

    const dispatch = await postJson(baseUrl, "/api/research/dispatch", operatorHeaders, {
      sendToTelegram: false,
      force: true,
    });

    await postJson(
      baseUrl,
      `/api/runs/${dispatch.run.id}/fail`,
      {
        "x-operator-secret": process.env.OPERATOR_API_SECRET,
        "Content-Type": "application/json",
      },
      {
        reason: "debug script cleanup",
      },
    );

    console.log(
      JSON.stringify(
        {
          status: dispatch.status,
          mode,
          firstCatalogClearTopicBeforeFix: firstClearTopicId,
          selectedTopicId: dispatch.selection.topic.id,
          selectedTitle: dispatch.selection.topic.title,
          selectionMode: dispatch.selection.metadata.selectionMode,
          seriesTitle: dispatch.selection.metadata.seriesTitle,
          seriesOrder: dispatch.selection.metadata.seriesOrder,
          previousTopicLink: dispatch.selection.metadata.previousTopicLink?.title ?? null,
          selectionReason: dispatch.selection.metadata.selectionReason,
          summary: dispatch.draft.summary,
          keyTerms: dispatch.draft.key_terms,
        },
        null,
        2,
      ),
    );
  } finally {
    if (mode === "synthetic") {
      cleanupSyntheticHistory(dataRoot);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
