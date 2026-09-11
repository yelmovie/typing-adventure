# OG 공유 이미지 v0.4.0 — 2026-09-12

사용자가 새 시안 1번 ‘네 친구와 성’을 선택했다. 과거 `public/assets/og/og-sample-01-all-stars.png`를 직접 배포한 것이 아니라, 이를 참고해 2026-09-12 내장 image_gen으로 다시 생성한 `output/imagegen/og-samples-20260912/01-all-stars.png`를 사용했다. 새 이미지 생성이나 외부 업로드는 이번 적용 과정에서 하지 않았다.

- 보존 원본: `assets/ui/social-preview-source-v040.png`, 1774×887, 3,001,895B.
- 배포 JPG: `public/icons/social-preview.jpg`, 1200×600 (2:1), 252,863B. sharp JPEG quality 84, mozjpeg.
- 참조 입력: 과거 자체 제작 all-stars 구도와 `assets/ui/logo-typing-adventure.png`의 정확한 제목·색상.
- 생성 수단: Codex 내장 image_gen. 기존 시안 생성 기록에서 출처와 원문 프롬프트를 아래에 보존했다.
- 확인: 제목 철자, 네 캐릭터, 지호의 둥근 안경, 2:1 전체 구도. OG/Twitter alt와 OG MIME·치수를 반영했다.
- 공개 도메인의 절대 OG URL과 외부 공유 미리보기는 배포 담당자가 최종 URL 확정 후 확인한다.

재현:

```powershell
node -e "require('sharp')('assets/ui/social-preview-source-v040.png').resize(1200,600,{fit:'cover'}).jpeg({quality:84,mozjpeg:true}).toFile('public/icons/social-preview.jpg')"
```

## 선택한 시안의 원문 생성 프롬프트
Use case: ads-marketing. Edit the supplied existing Typing Adventure promotional key art into one new polished OG/social-sharing cover variant. Output exactly ONE standalone horizontal image, exact width:height 2:1, ideally 2048 by 1024 pixels, full bleed, no sheet of alternatives. The supplied all-stars image is the edit target and visual identity reference: retain the same four recognizable Korean elementary-school-age chibi adventure characters, high-quality detailed pixel-art-inspired 2D game illustration, crisp silhouettes, lively expressions, painterly pixel texture. The supplied separate logo image is an exact title spelling and gold/royal-blue identity reference. Title must read exactly "타이핑 어드벤처", accurate Hangul, exceptionally LARGE and dominant, readable at a 400x200 thumbnail. It must be a designed game title with chunky golden yellow faces, warm orange bevel shading, deep navy outline and cobalt ribbon/crown accents, not plain caption text. No other text, English text, slogans, labels, credits, numbers, UI buttons or watermarks. Keep every title stroke within a 5% safe margin. Do not repeat the title. Recognizable cast: Haneul has tousled brown hair, red scarf, blue jacket, white shirt, navy shorts, boots; Bora has chestnut ponytail with red bow, pink hooded jacket, dark skirt and pink sneakers; Jiho has navy blue hair and clearly visible ROUND DARK RIM GLASSES, green hooded jacket, shorts and brown backpack; Luca has blond hair, goggles on forehead, tan explorer jacket and backpack. Keep character identity and childlike age consistent; never change Jiho's glasses. Any small companions must only be an orange cat with red scarf or a white rabbit with pink collar. Keep image complexity subordinate to the giant title. Professional premium game packaging, friendly adventurous joy, no frightening violence. COMPOSITION VARIANT 1 — THE SIGNATURE HERO COVER. Dramatically recompose the reference: an enormous SINGLE-LINE centered gold title across 86–90% of the canvas width in the upper 38%, small crown integrated above its middle, a clean dark sapphire opening in the sky behind the title so the words pop. All four heroes standing proudly together across the lower half, full faces and clean readable poses, Haneul at center-left lifting a glowing blank golden keycap, Bora waving at center-right, Jiho's round glasses on left and Luca on right. Add the cat and rabbit by their feet, not covering faces. Sweeping storybook floating castle, turquoise river and warm sunrise on the far sides, luminous gold motes used sparingly. Rich royal blue, fresh green and golden yellow. Bright welcoming adventure, excellent overall balance. Keep title substantially larger than in the reference image. The picture fills the exact 2:1 frame.

## 배포 산출물 확인

2026-09-12 통합 빌드의 `http://127.0.0.1:4180/icons/social-preview.jpg`를 HTTP로 읽어 로컬 최적화 JPG와 바이트가 완전히 같음을 확인했다. JPEG 1200×600, 252,863B. 실제 HTML의 OG 이미지 width/height/MIME/alt와 Twitter image/alt도 확인했다. 외부 공개 URL의 절대 메타 주소 및 실제 SNS 캐시 미리보기는 배포 담당자가 URL 확정 후 검증한다.

공개 서비스 주소 확정: https://typing-adventure-six.vercel.app/ . OG·Twitter 이미지 절대주소는 https://typing-adventure-six.vercel.app/icons/social-preview.jpg 이며 canonical/og:url도 같은 서비스 주소다. 외부 SNS 게시물을 작성하거나 전송하지 않았다.
