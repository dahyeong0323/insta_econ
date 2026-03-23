export type ResearchSeries = {
  id: string;
  title: string;
  narrativeArc: string;
};

export type ResearchTopic = {
  id: string;
  conceptId: string;
  title: string;
  summary: string;
  keyTerms: string[];
  aliases: string[];
  sourceTextSeed: string;
  series: ResearchSeries;
  seriesOrder: number;
  curriculumPosition: string;
  teachingAngle: string;
  prerequisiteTopicIds: string[];
  followUpTopicIds: string[];
};

const researchSeriesCatalog = {
  "economic-basics": {
    id: "economic-basics",
    title: "경제의 기본 문법",
    narrativeArc: "희소성에서 출발해 선택, 예산, 가격, 경쟁으로 이어지는 입문 시리즈",
  },
  "money-and-finance": {
    id: "money-and-finance",
    title: "돈과 금융의 흐름",
    narrativeArc: "돈의 역할에서 출발해 물가, 저축, 대출, 환율, 보험으로 확장하는 시리즈",
  },
  "production-and-growth": {
    id: "production-and-growth",
    title: "생산과 교환",
    narrativeArc: "분업과 생산성, 교환 구조를 통해 경제 성장의 바닥을 이해하는 시리즈",
  },
  "market-and-policy": {
    id: "market-and-policy",
    title: "시장과 정책",
    narrativeArc: "세금과 공공서비스, 시장 실패, 가격 통제, 노동시장까지 연결하는 시리즈",
  },
} satisfies Record<string, ResearchSeries>;

function withSeries(
  seriesId: keyof typeof researchSeriesCatalog,
  topic: Omit<ResearchTopic, "series">,
): ResearchTopic {
  return {
    ...topic,
    series: researchSeriesCatalog[seriesId],
  };
}

export const middleSchoolEconomicsTopics: ResearchTopic[] = [
  withSeries("economic-basics", {
    id: "scarcity",
    conceptId: "scarcity",
    title: "경제는 왜 항상 '부족함'에서 시작할까?",
    summary: "희소성과 선택의 출발점을 학교생활과 시간 관리 예시로 설명한다.",
    keyTerms: ["희소성", "자원", "선택", "우선순위"],
    aliases: ["부족함", "한정된 자원", "모자람", "제한된 시간", "희귀함"],
    sourceTextSeed:
      "경제는 원하는 것은 많지만 시간, 돈, 물건, 노동 같은 자원은 한정돼 있다는 사실에서 출발한다. 그래서 무엇을 먼저 고를지 순서를 정해야 하고, 그 과정 전체가 경제 활동이 된다. 하루 24시간, 한정된 용돈, 매점에서 고를 수 있는 간식처럼 학생이 바로 체감할 수 있는 예시로 풀어내면 이해가 쉽다.",
    seriesOrder: 1,
    curriculumPosition: "입문 1단계: 경제가 왜 선택의 문제인지 이해하기",
    teachingAngle: "경제를 거창한 뉴스가 아니라 일상 속 선택 문제로 소개한다.",
    prerequisiteTopicIds: [],
    followUpTopicIds: ["opportunity-cost", "consumer-choice-and-budget"],
  }),
  withSeries("economic-basics", {
    id: "opportunity-cost",
    conceptId: "opportunity-cost",
    title: "하나를 고르면 다른 하나를 포기해야 하는 이유는 뭘까?",
    summary: "기회비용을 학생의 시간, 용돈, 선택 상황으로 풀어낸다.",
    keyTerms: ["기회비용", "선택", "포기", "대가"],
    aliases: ["보이지 않는 비용", "포기한 것의 가치", "선택의 대가", "놓친 기회"],
    sourceTextSeed:
      "어떤 선택을 할 때는 눈에 보이는 돈만 드는 것이 아니라 포기한 다른 선택의 가치도 함께 생긴다. 그 포기한 가치가 기회비용이다. 학원과 운동, 간식과 교통비, 공부 시간과 휴식 시간처럼 학생이 자주 겪는 상황으로 설명하면 '선택에는 항상 대가가 있다'는 점이 자연스럽게 전달된다.",
    seriesOrder: 2,
    curriculumPosition: "입문 2단계: 선택에는 보이지 않는 비용이 있다는 점 이해하기",
    teachingAngle: "선택의 결과보다 포기한 대안의 가치를 보게 만든다.",
    prerequisiteTopicIds: ["scarcity"],
    followUpTopicIds: ["consumer-choice-and-budget"],
  }),
  withSeries("economic-basics", {
    id: "consumer-choice-and-budget",
    conceptId: "consumer-choice-and-budget",
    title: "용돈이 정해져 있으면 소비 선택은 어떻게 달라질까?",
    summary: "예산 제약이 소비 우선순위와 선택을 어떻게 바꾸는지 보여 준다.",
    keyTerms: ["예산", "소비", "선택", "우선순위"],
    aliases: ["용돈 관리", "예산 제약", "한정된 돈", "소비 계획"],
    sourceTextSeed:
      "사고 싶은 것은 많아도 쓸 수 있는 돈이 정해져 있으면 사람은 우선순위를 정하게 된다. 경제학에서는 이를 예산 제약 안의 선택이라고 본다. 교통비와 간식비를 함께 써야 하는 상황, 같은 가격이어도 꼭 필요한 것부터 사게 되는 상황을 예로 들면 예산이 소비 행동을 바꾸는 원리가 잘 드러난다.",
    seriesOrder: 3,
    curriculumPosition: "입문 3단계: 제한된 돈 안에서 우선순위를 정하는 법 이해하기",
    teachingAngle: "희소성과 기회비용이 실제 소비 결정으로 이어지는 순간을 보여 준다.",
    prerequisiteTopicIds: ["scarcity", "opportunity-cost"],
    followUpTopicIds: ["demand-and-supply"],
  }),
  withSeries("economic-basics", {
    id: "demand-and-supply",
    conceptId: "demand-and-supply",
    title: "수요와 공급은 왜 가격을 움직일까?",
    summary: "사고 싶어 하는 사람 수와 팔려는 양이 가격을 바꾸는 원리를 설명한다.",
    keyTerms: ["수요", "공급", "가격", "시장"],
    aliases: ["사려는 사람", "팔려는 양", "시장가격", "수요 공급"],
    sourceTextSeed:
      "수요는 사려는 마음과 실제 구매 의사이고, 공급은 팔려는 양이다. 같은 물건을 원하는 사람이 많아지면 가격이 오르기 쉽고, 공급이 늘어나면 가격이 내려가기 쉽다. 인기 간식, 한정판 굿즈, 계절 음식처럼 학생이 익숙한 사례로 보여 주면 가격이 왜 움직이는지 직관적으로 이해할 수 있다.",
    seriesOrder: 4,
    curriculumPosition: "기초 4단계: 시장에서 가격이 움직이는 핵심 원리 이해하기",
    teachingAngle: "가격을 숫자가 아니라 사람들의 선택이 모인 결과로 읽게 만든다.",
    prerequisiteTopicIds: ["consumer-choice-and-budget"],
    followUpTopicIds: ["competition-and-choice", "price-ceiling-shortage"],
  }),
  withSeries("economic-basics", {
    id: "competition-and-choice",
    conceptId: "competition-and-choice",
    title: "가게가 많아지면 왜 소비자에게 유리할까?",
    summary: "경쟁이 가격, 품질, 선택권에 어떤 영향을 주는지 설명한다.",
    keyTerms: ["경쟁", "소비자", "가격", "품질"],
    aliases: ["선택권", "비교", "경쟁 시장", "더 나은 서비스"],
    sourceTextSeed:
      "비슷한 물건을 파는 곳이 많아지면 소비자는 가격과 품질을 비교할 수 있고, 판매자는 더 좋은 조건을 내놓으려 노력한다. 그래서 경쟁은 보통 선택권을 넓히고 서비스 개선을 만들 수 있다. 편의점 간 행사 경쟁, 배달앱 할인 경쟁처럼 익숙한 예시를 쓰면 학생도 바로 연결할 수 있다.",
    seriesOrder: 5,
    curriculumPosition: "기초 5단계: 경쟁이 시장을 어떻게 바꾸는지 이해하기",
    teachingAngle: "경쟁을 기업끼리의 싸움이 아니라 소비자 경험의 변화로 보여 준다.",
    prerequisiteTopicIds: ["demand-and-supply"],
    followUpTopicIds: ["market-failure"],
  }),
  withSeries("money-and-finance", {
    id: "money-functions",
    conceptId: "money-functions",
    title: "돈은 왜 그냥 종이가 아니라 '약속'이라고 할까?",
    summary: "돈의 기능을 교환 수단, 가치 저장, 계산 단위로 풀어낸다.",
    keyTerms: ["돈", "교환", "가치저장", "계산단위"],
    aliases: ["화폐", "돈의 기능", "가격 표시", "교환 수단"],
    sourceTextSeed:
      "돈은 물건과 물건을 직접 바꾸는 불편을 줄여 주는 공통 약속이다. 사람들은 돈으로 가격을 비교하고, 현재의 가치를 미래로 옮기며, 거래를 빠르게 처리한다. 그래서 돈은 종이 자체보다 모두가 믿고 쓰는 약속이라는 점이 더 중요하다. 학생에게는 용돈과 간편결제 예시가 이해를 돕는다.",
    seriesOrder: 1,
    curriculumPosition: "금융 1단계: 돈이 왜 필요한지 이해하기",
    teachingAngle: "돈의 기능을 암기 항목이 아니라 생활 편의를 만든 약속으로 설명한다.",
    prerequisiteTopicIds: [],
    followUpTopicIds: ["inflation-purchasing-power", "saving-and-interest"],
  }),
  withSeries("money-and-finance", {
    id: "inflation-purchasing-power",
    conceptId: "inflation",
    title: "물가가 오르면 왜 같은 돈으로 살 수 있는 게 줄어들까?",
    summary: "인플레이션과 구매력의 관계를 생활 소비 예시로 설명한다.",
    keyTerms: ["물가", "인플레이션", "구매력", "용돈"],
    aliases: ["물가 상승", "돈의 가치 하락", "체감 물가", "실질 구매력"],
    sourceTextSeed:
      "물가가 오른다는 것은 가격표만 바뀐다는 뜻이 아니라 같은 돈으로 살 수 있는 양이 줄어든다는 뜻이다. 예전에는 같은 용돈으로 간식 두 개를 살 수 있었는데 이제는 하나만 살 수 있다면 돈의 구매력이 줄어든 것이다. 학생에게는 매점, 배달, 교통비처럼 매일 만나는 지출 예시가 가장 직관적이다.",
    seriesOrder: 2,
    curriculumPosition: "금융 2단계: 돈의 가치가 변할 수 있다는 점 이해하기",
    teachingAngle: "인플레이션을 뉴스 용어가 아니라 체감 구매력 변화로 보여 준다.",
    prerequisiteTopicIds: ["money-functions"],
    followUpTopicIds: ["saving-and-interest", "exchange-rate"],
  }),
  withSeries("money-and-finance", {
    id: "saving-and-interest",
    conceptId: "saving-interest",
    title: "저축하면 돈이 조금씩 늘어나는 이유는 뭘까?",
    summary: "저축과 이자가 시간과 연결되는 방식을 설명한다.",
    keyTerms: ["저축", "이자", "은행", "미래"],
    aliases: ["예금", "저금", "돈 불리기", "이자 수익"],
    sourceTextSeed:
      "저축은 지금 쓰지 않고 미래를 위해 돈을 남겨 두는 행동이다. 은행은 그 돈을 다른 곳에 빌려 주거나 운용하고, 그 대가 일부를 이자로 돌려준다. 그래서 시간이 지나면 원금에 이자가 붙어 금액이 늘어난다. 다만 물가가 빠르게 오르면 통장 숫자와 실제 가치가 다를 수 있다는 점도 함께 알려 주는 것이 좋다.",
    seriesOrder: 3,
    curriculumPosition: "금융 3단계: 돈을 미루어 쓰는 선택과 보상을 이해하기",
    teachingAngle: "저축을 참는 행동이 아니라 미래 선택권을 사는 행동으로 설명한다.",
    prerequisiteTopicIds: ["money-functions", "inflation-purchasing-power"],
    followUpTopicIds: ["loan-and-interest", "risk-and-insurance"],
  }),
  withSeries("money-and-finance", {
    id: "loan-and-interest",
    conceptId: "loan-interest",
    title: "돈을 빌리면 왜 원금보다 더 많이 갚아야 할까?",
    summary: "대출과 이자의 기본 원리를 학생이 이해할 수 있게 설명한다.",
    keyTerms: ["대출", "이자", "원금", "상환"],
    aliases: ["돈 빌리기", "빌린 돈의 대가", "상환 계획", "대출 비용"],
    sourceTextSeed:
      "돈을 빌린다는 것은 지금 필요한 돈을 먼저 쓰고 나중에 갚겠다는 약속이다. 빌려 준 사람은 그 기간 동안 자기 돈을 쓰지 못하므로 그 대가를 이자로 받는다. 그래서 빌린 원금만 갚는 것이 아니라 시간에 대한 비용도 함께 갚게 된다. 학생에게는 학원비 분할 납부, 휴대폰 할부 같은 익숙한 사례가 도움이 된다.",
    seriesOrder: 4,
    curriculumPosition: "금융 4단계: 미래 소득을 당겨 쓰는 선택의 비용 이해하기",
    teachingAngle: "대출을 무조건 나쁜 것으로 보지 않고 시간의 대가라는 구조로 설명한다.",
    prerequisiteTopicIds: ["saving-and-interest"],
    followUpTopicIds: ["risk-and-insurance"],
  }),
  withSeries("money-and-finance", {
    id: "exchange-rate",
    conceptId: "exchange-rate",
    title: "환율이 오르면 우리 생활엔 어떤 변화가 생길까?",
    summary: "환율 변화가 수입품, 여행, 기업 비용에 미치는 영향을 설명한다.",
    keyTerms: ["환율", "달러", "수입", "해외여행"],
    aliases: ["원달러 환율", "환전", "외국 돈", "수입 가격"],
    sourceTextSeed:
      "환율은 우리 돈과 다른 나라 돈을 바꾸는 비율이다. 환율이 오르면 같은 달러를 사는 데 더 많은 원화가 필요하다는 뜻이므로 수입품 가격이나 해외여행 비용이 비싸질 수 있다. 반대로 수출 기업에는 유리하게 작용할 때도 있다. 학생에게는 게임 아이템 해외 결제, 수입 간식 가격처럼 생활에 가까운 연결 고리를 주는 것이 좋다.",
    seriesOrder: 5,
    curriculumPosition: "금융 5단계: 국내 생활과 세계 경제가 이어져 있음을 이해하기",
    teachingAngle: "환율을 국제 뉴스 숫자가 아니라 생활비와 연결된 가격 문제로 보여 준다.",
    prerequisiteTopicIds: ["money-functions", "inflation-purchasing-power"],
    followUpTopicIds: [],
  }),
  withSeries("money-and-finance", {
    id: "risk-and-insurance",
    conceptId: "risk-insurance",
    title: "보험은 왜 많은 사람이 위험을 나누는 방법일까?",
    summary: "보험이 위험 분산 장치라는 점을 쉬운 사례로 설명한다.",
    keyTerms: ["보험", "위험", "분산", "보장"],
    aliases: ["위험 나누기", "예상 못 한 비용", "공동 대비", "보장 장치"],
    sourceTextSeed:
      "사고나 질병처럼 언제 닥칠지 모르는 큰 비용은 혼자 감당하면 매우 부담스럽다. 보험은 많은 사람이 조금씩 비용을 모아 두었다가 실제 사고를 겪은 사람을 돕는 구조다. 그래서 보험의 핵심은 무조건 돈을 버는 것이 아니라 큰 위험을 여러 사람이 나누는 데 있다. 학생에게는 자전거 사고나 휴대폰 파손 같은 예시가 적절하다.",
    seriesOrder: 6,
    curriculumPosition: "금융 6단계: 불확실한 미래 비용을 관리하는 방법 이해하기",
    teachingAngle: "보험을 상품 광고가 아니라 위험 관리 도구로 설명한다.",
    prerequisiteTopicIds: ["saving-and-interest", "loan-and-interest"],
    followUpTopicIds: [],
  }),
  withSeries("production-and-growth", {
    id: "specialization-and-trade",
    conceptId: "specialization-trade",
    title: "각자 잘하는 일을 나누면 왜 더 효율적일까?",
    summary: "분업과 교환의 장점을 학교 프로젝트와 일상 예시로 설명한다.",
    keyTerms: ["분업", "교환", "효율", "전문화"],
    aliases: ["역할 나누기", "각자 잘하는 일", "특화", "서로 바꾸기"],
    sourceTextSeed:
      "모든 사람이 모든 일을 잘할 수는 없다. 각자 잘하는 일에 집중하고 서로 필요한 것을 교환하면 같은 시간과 노력으로 더 많은 결과를 만들 수 있다. 조별 과제에서 역할을 나누는 상황, 집안일을 분담하는 상황처럼 익숙한 예시를 쓰면 분업과 교환의 장점이 자연스럽게 전달된다.",
    seriesOrder: 1,
    curriculumPosition: "생산 1단계: 함께 일하면 왜 더 효율적인지 이해하기",
    teachingAngle: "분업을 거대한 산업 구조보다 학생이 이미 해 본 협업 경험에서 꺼낸다.",
    prerequisiteTopicIds: [],
    followUpTopicIds: ["productivity"],
  }),
  withSeries("production-and-growth", {
    id: "productivity",
    conceptId: "productivity",
    title: "생산성이 높아진다는 말은 정확히 무슨 뜻일까?",
    summary: "같은 자원으로 더 많은 결과를 만드는 생산성 개념을 설명한다.",
    keyTerms: ["생산성", "효율", "기술", "노동"],
    aliases: ["더 효율적으로 만들기", "같은 시간 더 많은 결과", "기술 향상", "산출"],
    sourceTextSeed:
      "생산성은 같은 시간, 같은 사람, 같은 자원으로 더 많은 결과를 만들어 내는 힘이다. 단순히 더 오래 일하는 것이 아니라 더 효율적인 방법을 찾는 것이 핵심이다. 도구가 좋아지거나 작업 순서가 정리되면 생산성이 높아질 수 있다. 학생에게는 공부 방법 개선이나 조별 과제 준비 과정을 예로 들면 이해하기 쉽다.",
    seriesOrder: 2,
    curriculumPosition: "생산 2단계: 성장과 효율의 차이를 이해하기",
    teachingAngle: "생산성을 열심히 하기와 혼동하지 않도록 '방법의 변화'에 초점을 둔다.",
    prerequisiteTopicIds: ["specialization-and-trade"],
    followUpTopicIds: [],
  }),
  withSeries("market-and-policy", {
    id: "tax-and-public-services",
    conceptId: "tax-public-services",
    title: "세금은 왜 꼭 필요할까?",
    summary: "세금과 공공서비스가 어떻게 연결되는지 설명한다.",
    keyTerms: ["세금", "공공서비스", "정부", "재정"],
    aliases: ["세금의 역할", "공공재원", "공공서비스 비용", "공동 부담"],
    sourceTextSeed:
      "도로, 학교, 공원, 소방, 치안처럼 모두가 함께 쓰는 서비스는 개인이 각자 돈을 내는 방식만으로는 충분히 운영되기 어렵다. 그래서 정부는 세금을 모아 공공서비스를 제공한다. 세금은 단순히 돈을 걷는 것이 아니라 공동생활에 필요한 기반을 만드는 비용이라는 점을 학생 눈높이에서 설명하는 것이 중요하다.",
    seriesOrder: 1,
    curriculumPosition: "정책 1단계: 정부가 왜 경제에 등장하는지 이해하기",
    teachingAngle: "세금을 뺏기는 돈이 아니라 함께 쓰는 서비스의 비용으로 읽게 한다.",
    prerequisiteTopicIds: [],
    followUpTopicIds: ["market-failure"],
  }),
  withSeries("market-and-policy", {
    id: "market-failure",
    conceptId: "market-failure",
    title: "시장에 맡기기만 하면 항상 좋은 결과가 나올까?",
    summary: "외부효과와 공공재를 포함해 시장 실패의 기초를 설명한다.",
    keyTerms: ["시장실패", "외부효과", "공공재", "정부"],
    aliases: ["시장이 해결 못하는 문제", "시장 한계", "공공재 문제", "외부효과"],
    sourceTextSeed:
      "시장은 많은 문제를 잘 해결하지만 언제나 완벽하지는 않다. 어떤 행동의 이익이나 비용이 다른 사람에게 흘러가면 외부효과가 생기고, 모두가 함께 써야 하는 공공재는 시장만으로 충분히 공급되지 않을 수 있다. 그래서 어떤 경우에는 정부 규칙이나 공동 대응이 필요하다는 점을 학생도 이해할 수 있게 설명해야 한다.",
    seriesOrder: 2,
    curriculumPosition: "정책 2단계: 시장의 장점과 한계를 함께 이해하기",
    teachingAngle: "시장 만능도, 정부 만능도 아닌 균형 있는 시각을 만든다.",
    prerequisiteTopicIds: ["tax-and-public-services", "competition-and-choice"],
    followUpTopicIds: ["price-ceiling-shortage", "minimum-wage"],
  }),
  withSeries("market-and-policy", {
    id: "price-ceiling-shortage",
    conceptId: "price-ceiling-shortage",
    title: "가격을 억지로 묶으면 왜 물건이 부족해질 수 있을까?",
    summary: "가격상한제와 shortage가 왜 생기는지 설명한다.",
    keyTerms: ["가격상한제", "부족", "통제", "시장"],
    aliases: ["가격 통제", "최고가격", "공급 부족", "품귀"],
    sourceTextSeed:
      "가격을 법이나 규칙으로 너무 낮게 묶어 두면 사려는 사람은 늘어나지만 팔려는 사람은 줄 수 있다. 그러면 겉보기에는 싸 보이지만 실제로는 구하기 어려운 부족 현상이 생길 수 있다. 공연 티켓, 인기 굿즈, 학교 매점 한정 메뉴처럼 학생이 이해하기 쉬운 예시를 쓰면 가격 통제가 왜 예상과 다르게 작동할 수 있는지 잘 보인다.",
    seriesOrder: 3,
    curriculumPosition: "정책 3단계: 가격 통제가 시장에 미치는 부작용 이해하기",
    teachingAngle: "좋은 의도로 만든 규칙도 결과는 다를 수 있다는 점을 보여 준다.",
    prerequisiteTopicIds: ["demand-and-supply", "market-failure"],
    followUpTopicIds: ["minimum-wage"],
  }),
  withSeries("market-and-policy", {
    id: "minimum-wage",
    conceptId: "minimum-wage",
    title: "최저임금은 왜 경제 뉴스에 자주 나올까?",
    summary: "최저임금이 노동자와 사업자에게 주는 영향을 균형 있게 설명한다.",
    keyTerms: ["최저임금", "임금", "노동", "사업자"],
    aliases: ["최소 임금", "임금 하한선", "알바 시급", "노동시장"],
    sourceTextSeed:
      "최저임금은 너무 낮은 임금을 막기 위해 정한 사회적 기준이다. 노동자에게는 기본 생활을 지키는 장치가 될 수 있지만, 사업자에게는 인건비 부담으로 느껴질 수 있다. 그래서 최저임금은 공정성과 고용 사이의 균형 문제로 자주 논의된다. 학생에게는 아르바이트 시급 뉴스처럼 생활과 가까운 장면으로 설명하는 것이 좋다.",
    seriesOrder: 4,
    curriculumPosition: "정책 4단계: 노동시장 규칙의 장점과 부담 함께 보기",
    teachingAngle: "찬반 대결보다 어떤 이해관계가 충돌하는지 구조를 보여 준다.",
    prerequisiteTopicIds: ["market-failure", "price-ceiling-shortage"],
    followUpTopicIds: ["unemployment"],
  }),
  withSeries("market-and-policy", {
    id: "unemployment",
    conceptId: "unemployment",
    title: "실업은 왜 단순히 일자리가 없다는 뜻만은 아닐까?",
    summary: "실업의 여러 원인과 경제 구조 변화를 쉽게 설명한다.",
    keyTerms: ["실업", "고용", "경기", "기술변화"],
    aliases: ["일자리 부족", "구조적 실업", "경기 침체", "고용 문제"],
    sourceTextSeed:
      "실업은 단순히 일을 하기 싫어서 생기는 문제가 아니다. 경기 침체, 산업 변화, 기술 변화, 지역 이동 문제처럼 여러 이유로 일자리를 찾기 어려울 수 있다. 그래서 실업은 개인의 문제이면서도 경제 구조와 연결된 문제다. 학생에게는 뉴스에서 보는 청년 취업, 자동화, 경기 악화 사례를 쉽게 풀어 주는 방식이 적절하다.",
    seriesOrder: 5,
    curriculumPosition: "정책 5단계: 노동시장 문제를 개인 탓만으로 보지 않기",
    teachingAngle: "실업을 낙인 대신 구조 문제로 읽게 만들어 계정 톤을 지킨다.",
    prerequisiteTopicIds: ["minimum-wage", "productivity"],
    followUpTopicIds: [],
  }),
];

export const researchTopicById = new Map(
  middleSchoolEconomicsTopics.map((topic) => [topic.id, topic] as const),
);
