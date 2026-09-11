# 캐릭터 보행 시트 v2 — 2026-09-11

생성 방식: 내장 image_gen. 기존 보행 시트와 각 인물의 정면 초상을 참조한다. 4명 각각 4×2 격자의 8프레임 오른쪽 보행을 생성한다. 실제 게임은 단일 char_walk_v2 atlas의 c0_r0..c7_r3을 순환한다.

공통 조건: 투명 배경, 동일 크기·시점·몸 중심·접지선. 접지→무게 이동→다리 교차→밀어내기→반대발 접지의 8단계 연속 주기. 팔은 반대발과 함께 흔들리고 머리·몸통은 안정적으로 유지한다. 그림자·글자·속도 잔상은 넣지 않는다.

지호: 모든 프레임에 둥근 검은 안경테·투명 렌즈·귀로 이어지는 안경다리를 유지한다. 하늘의 빨간 목도리, 보라의 분홍 후드와 묶은 머리, 루카의 머리 위 고글도 유지한다.

전체 생성 프롬프트는 CHARACTER-WALK-V2-PROMPTS.json에 보관한다.

최종 저장 파일:
- assets/character/character-walk-brown_boy-v2.png
- assets/character/character-walk-pink_girl-v2.png
- assets/character/character-walk-glasses_boy-v2.png
- assets/character/character-walk-blond_explorer-v2.png
- assets/character/character-idle-side-v2.png
- 게임 적용: public/assets/sprites/char_walk_v2.webp 및 char_walk_v2.json (9열×4행, 보행 8장 + 대기 1장/인물)

초기 보라 결과에는 실제 알파 채널이 있었으나 외곽에 붉은 잡점이 남아 내장 image_gen으로 외곽을 정리한 단색 마젠타 결과로 교체했다. 나머지 보행 결과는 불투명 체크무늬가 생성되어 내장 image_gen으로 배경만 단색 마젠타로 수정했다. 매트 제거·셀 분리·기준점 정렬·WebP 패킹은 scripts/build-walk-v2-assets.mjs에서 재현한다. 연결된 배경만 제거해 분홍 의상을 보존한다. 실제 게임에는 투명 배경으로 표시된다.

## 보라 외곽 정리 프롬프트

Edit this same eight-frame pink-hoodie girl walk sprite sheet for clean production alpha extraction. Preserve the exact eight poses, character proportions, face, hairstyle, pink ribbon, hoodie, skirt, backpack, shoes, and 4 by 2 cell arrangement. Only repair the cutout edges: remove all stray red/orange speckles, disconnected pixel noise and ghost halo outside the character silhouettes. Restore one clean dark outline around each character, with no floating edge debris. Replace the entire background with perfectly uniform solid bright magenta #FF00FF for chroma key extraction. No checkerboard, transparency simulation, shadow, gradient, labels, text, or ground. Do not redesign or relocate any character, add new poses, or change dimensions.

## 옆모습 대기 자세 생성 프롬프트

Use case: stylized-concept. Production 2D game sprite sheet with exactly FOUR full-body neutral standing poses in a uniform 2-column by 2-row grid, 1024x1024. Input1 walking sheet is the art style and SIDE VIEW identity reference. Inputs2-5 are front portraits for each identity only. Top-left Haneul brown tousled hair/red scarf/blue jacket/cream hoodie/navy shorts/blue sneakers/brown backpack. Top-right Bora brown ponytail/pink bow/pink hoodie/navy skirt/pink sneakers/pink backpack. Bottom-left Jiho navy hair/ROUND BLACK-RIMMED EYEGLASSES/visible near lens AND black temple extending to his ear in side view/teal hoodie/cream shirt/navy shorts/navy sneakers/brown backpack. Bottom-right Luka blond hair/goggles ON TOP of head/tan jacket/navy shorts/brown boots/brown backpack with blue bedroll. All stand relaxed FACING RIGHT in the SAME side-three-quarter angle as walking sheet, BOTH feet planted under their hips, arms relaxed close to their body; no walking or running, no raised knees, no action poses. Preserve exactly face, head proportions, hairstyle, clothing, outlines and vivid soft pixel illustration style from the matching reference. Lock Jiho glasses in profile and Luka goggles. Center each character in its own cell, full body safely within cell, 50px safety gutter. Plain uniform solid bright MAGENTA #FF00FF background for later chroma key packing. Absolutely no checkerboard, no gradients, no shadows, no ground, no labels or text. Only four characters.

## 배경 수정 프롬프트 (루카, 하늘·지호도 같은 배경 보존 조건)

Edit the supplied character sprite sheet. Make EXACTLY ONE change: replace the fake light gray checkerboard background with a perfectly uniform solid chroma-key magenta background, RGB #FF00FF. Preserve all eight character drawings, poses, accessories, facial features, the goggles, colors, outline details, their exact positions, proportions, and the existing 4-column by 2-row arrangement. Do not add or remove or redraw any character. The same blond explorer boy wears his goggles on his forehead in all eight frames. No shadows, gradient, checkerboard, text, or marks on the background. Output the same image dimensions and preserve safe margins.
