# 공유 이미지 v2 (2026-09-18)

- 배포 파일: `public/icons/social-preview-v2.jpg`, 1200×600 (2:1), JPEG quality 84(mozjpeg), 약 237KB.
- 메타: `index.html` 의 `og:image` · `twitter:image` 절대주소 `https://typing-adventure-six.vercel.app/icons/social-preview-v2.jpg`. 파일명을 바꾼 이유는 카카오톡·SNS 가 URL 단위로 미리보기를 캐시하므로 같은 이름으로 덮어쓰면 옛 그림이 남기 때문이다.
- 구성(새 생성 없이 보유 에셋만 합성): 바탕 `public/assets/og/og-sample-05-citadel-victory.png`(1600×800, 2026-09-09 제작 시안 5번 "밝아진 성채 승리")를 1200×600 으로 축소하고, 그 위에 홈 아틀라스의 펫 `cheer` 프레임 4개(`pet_cat_home` · `pet_rabbit_home` · `pet_squirrel_home` · `pet_dragon_home`)를 발치에 그림자와 함께 얹었다. 합성 스크립트는 `tmp/final-check-20260918/compose-og.mjs`(sharp) 이며 git 에는 없다 — 재현 명령:

```bash
node tmp/final-check-20260918/compose-og.mjs
```

- 이전 파일 `public/icons/social-preview.jpg`(v0.4.0 시안 1번)는 `_unused/icons/social-preview-v040.jpg` 로 옮겼다(배포·git 제외). 출처 기록은 `assets/CREDITS.md` 참고.
- 검증: `scripts/check-hosted-release.mjs` 가 배포 URL 의 `og:image` 와 dist 파일 바이트 일치를 확인한다. 실제 카카오톡 미리보기는 배포 후 링크를 보내 확인한다(캐시 갱신에 시간이 걸릴 수 있다).
