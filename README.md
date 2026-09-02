# Buy Engine

Fundamental Flow에서 전달된 기업을 대상으로 밸류에이션과 분할 매수 판단을 관리하는 대시보드입니다.

## Live Dashboard

[buy-engine-dashboard.winipe76.chatgpt.site](https://buy-engine-dashboard.winipe76.chatgpt.site)

모바일과 데스크톱에서 후보 기업, Fundamental Score, 밸류에이션 및 업데이트 상태를 확인할 수 있습니다.

## Responsibility

- Fundamental Flow: 기업의 펀더멘털 변화와 후보 선정
- Buy Engine: 밸류에이션과 매수 단계 판단

Fundamental 지표는 전달받은 값을 사용하며 Buy Engine 내부에서 재계산하지 않습니다.

## Local Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
```

로컬 환경 파일과 API 키는 Git에 포함되지 않습니다. 변경 이력은 `DASHBOARD_REVISIONS.md`에서 관리합니다.

