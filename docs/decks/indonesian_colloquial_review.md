# 인도네시아어 구어체 덱 · 1000장 검수 메모

- 카드 파일: `indonesian_colloquial.csv` (UTF-8, Anki 가져오기용, 필드 순서는 요청서 그대로)
- 앱 안의 같은 덱: 덱 › 새 덱 › "인도네시아어 구어체 · 1000장" (`src/core/packs/indonesianColloquial.ts`)
- 예전에 100장·500장을 받은 덱은 덱 화면의 "새 단어 받기"(또는 새 덱 화면의 "기존 덱에 넣기")로 나머지를 뒤에 이어서 받는다. 복습 기록은 그대로다.
- 빈도 근거: OpenSubtitles2018 인도네시아어 단어 빈도표 (orgtre/top-open-subtitles-sentences, `bld/top_words/id_top_words.csv`, 3만 단어)
  - 코드는 CC BY 3.0, 목록은 OpenSubtitles 코퍼스 조건을 따른다.

## 이번에 하지 않은 것 (주장하지 않음)

- 현지인 검증, 자카르타 자연 발화 코퍼스(BTJ) 대조, 사전 대조는 하지 않았다. 뜻·예문·사용역은 작성자 판단이다.
- "이 단어들로 회화의 몇 %를 알아듣는다" 같은 이해율은 계산하지 않았다.
- 음성 파일은 만들지 않았다. 앱에서는 Gemini 음성 또는 기기 음성으로 단어와 예문을 읽는다.

## 순위·빈도 표기 규칙

- `Rank_Source`, `Source_Count`: 빈도표에 그 철자가 그대로 있는 경우에만 적었다 (대소문자 무시, 첫 번째로 나온 순위).
- 99장은 빈도표에 그대로 있다. 구어형도 있다: nggak 1243위, gimana 2514위, nyari 18384위.
- 빈도표에 없는 것:
  - `nggak apa-apa` 한 장. 여러 단어로 된 표현이라 순위를 비우고 `phrase` 태그를 달았다.
  - 빈도표에 없는 구어형을 보충한 카드(`supplementary_spoken`)는 이번 100장에 없다.

## 고르고 뺀 기준

자막은 대부분 외국 영화·드라마를 번역한 글이라 실제 말과 다르다. 그래서 순위를 그대로 따르지 않았다.

**뒤로 미루거나 뺀 것**
- **번역체·격식형:** kau(2위), anda, adalah, telah, bahwa, oleh, apakah, mengapa, sebuah, seorang, memiliki, melakukan, mengatakan.
  - 구어 대응형이 있으면 표준형 칸으로 보냈다. 예: tidak → nggak, sudah → udah, bagaimana → gimana, saja → aja.
- **극중 편향 어휘:** mati, membunuh, senjata, polisi, raja, perang, kapal, sial, sialan, Tuhan. 드라마·영화에 몰려 있어서 미뤘다.
- **잡음:** 영어(the, you, i, a, 's), 줄임 표기(yg, Tn, ku, mu, nya), 감탄사 표기(Oh, Hei, uh).
- **대명사가 붙은 형태:** padaku, denganmu, ayahku, ayahmu 같은 형태는 따로 카드로 만들지 않았다.
- **파생형 중복:** melihat, melihatnya, lihat은 liat 한 장으로 합치고 표준형·어근 칸에 연결했다.
- **gak:** nggak와 철자만 달라서 nggak 카드의 주의사항에 넣었다.

**앞으로 당긴 것**
- 인사·대명사·호칭·부정·질문·시간·장소·담화표지(sih, dong, deh, kan, nih, tuh, lho, kok, aja, banget)·생활 동사·형용사·연결어 순.

**구어 동사 연결**
- 형태가 그대로 대응하면 `구어형 | 표준형 | 어근`으로 이었다. 예: nyari | mencari | cari, nunggu | menunggu | tunggu
- 뜻만 대응하고 어근이 다르면 주의사항에 적었다:
  - bikin ↔ membuat
  - ngomong ↔ berbicara
  - bilang ↔ mengatakan
  - kasih ↔ memberi
- 표준형이 하나로 딱 대응하지 않으면 그렇게 적었다. 예: ngapain

**사용역**
- 표기는 `일반` / `구어` / `자카르타식` 세 가지만 썼다. 이번 100장에는 `격식`·`속어` 카드가 없다.
- 기본은 지역을 덜 타는 aku / kamu / nggak이다.
- gue, lo, doang은 `자카르타식`으로 따로 표시하고, 쓰는 상황을 주의사항에 적었다.

## 불확실한 표현 (검증 필요)

| 카드 | 확인할 점 |
|---|---|
| ngerti | 어근을 erti로 적었다. 사전에 따라 표기가 다를 수 있다 |
| capek | 사전 표제어가 capai로 실린 경우가 있다 |
| doang | 자카르타(베타위) 구어로 표시했다. 다른 도시에서 얼마나 쓰는지 확인 필요 |
| mas, mbak, kak | 호칭 선호가 지역·나이·상황마다 다르다. 하나의 전국 규칙이 아니다 |
| kok, sih, dong, deh, lho | 뜻이 문맥과 억양에 크게 좌우된다. 한국어 뜻은 대표적인 쓰임 하나만 적었다 |
| 예문 전체 | 짧고 흔한 문장으로 썼지만 현지인이 읽어 보지 않았다 |

## 101~500장 (두 번째 묶음)

- 같은 빈도표에서 앞의 100장에 없는 단어를 골랐다. 기준은 첫 묶음과 같다 (번역체·극중 어휘·잡음은 빼고, 구어형이 있으면 구어형).
- 518장을 만든 뒤, 덜 급한 추상 명사·중복형(pikir/mikir, kirim/ngirim 등)·드문 형용사 118장을 빼서 400장으로 맞췄다.
- 순서는 **빈도순**이다. 구어형은 표준형의 순위로 세웠다 (예: cepet → cepat의 순위). 여러 단어 표현은 가장 드문 단어의 순위를 따른다. 빈도표에 없는 은어(kepo, baper, mager, cie)와 ojek은 맨 뒤.
- 357장은 빈도표에 그 철자 그대로 있다. 43장은 없다: 구어 발음(laper, pedes, rame…), 여러 단어 표현(selamat pagi, rumah sakit…), 은어. CSV에서 `Rank_Source`가 비어 있고 `supplementary_spoken` 또는 `phrase` 태그가 붙는다.
- 새 태그: `noun`(명사), `adverb`(부사), `number`(숫자).
- 첫 묶음에서 극중 편향으로 미뤘던 mati는 '(기계·불이) 꺼지다' 뜻이 생활에 흔해서 넣었다. anjing, babi는 욕으로도 쓰인다는 주의를 달았다.
- 간호 일과 겹치는 몸·증상 단어(pusing, demam, batuk, mual, napas, jantung 등)를 넣었다.

### 더 확인할 것 (두 번째 묶음)

| 카드 | 확인할 점 |
|---|---|
| kepo, baper, mager, gabut 계열 | 젊은 층 은어. 나이 든 사람과는 쓰지 않는다 |
| bete | 어원 설명(BT, bad temper)은 흔한 설명일 뿐 확인하지 않았다 |
| bokap, nyokap, entar, kelar | 자카르타식. 다른 지역에서는 어색할 수 있다 |
| bareng ↔ bersama, mending ↔ lebih baik | 뜻만 대응한다 |
| 예문 전체 | 첫 묶음과 마찬가지로 현지인이 읽어 보지 않았다 |

## 501~1000장 (세 번째 묶음)

- 두 번째 묶음에서 뺐던 118장 + 같은 빈도표의 다음 단어(대략 1500위 안쪽)로 433장을 새로 써서 551장을 만든 뒤, 덜 급한 51장(raksasa, takdir, 무기·전쟁 쪽, 추상 명사 등)을 빼 500장으로 맞췄다.
- 순서는 이 묶음 안에서 빈도순 (규칙은 두 번째 묶음과 같음). 1~500장의 순서는 바꾸지 않았다.
- 393장은 빈도표에 그 철자 그대로 있고, 107장은 없다(대부분 ng-/ny- 구어 동사형: nyelametin, ngikutin, nolak…, 여러 단어 표현, 은어). 이런 구어 동사는 표준형(menyelamatkan 등)의 순위로 줄 세웠다.
- 자막 빈도표라 극중 어휘(polisi, pistol, 감옥 등)가 많아서 생활 단어를 우선했다. 간호 일과 겹치는 단어(pasien, operasi, tekanan darah, darurat, sadar, kondisi, hasil, tes darah, tulang patah)를 넣었다.
- 속어 표시: sial(가벼운 욕). dasar는 사람 앞에 붙으면 나무라는 말.

## 1001~1250장 (네 번째 묶음, 2026-10-23)

- 사용자 요청: "단어 250개 더" (목표: 읽기에서 아는 단어 95%).
- 처음엔 빈도표를 보지 않고 쓸모만으로 골랐다가, 사용자 지적("순위표가 자주 나오는 순서 아니야?")으로 다시 골랐다: 같은 자막 빈도표에서 덱에 없는 단어를 보고, 격식형 변형(lakukan, katakan 등 이미 아는 단어의 다른 꼴)과 극중 어휘(senjata, raja 등)는 뺐다. 빈도가 낮은 생활 단어 56개(집안일·과일·양념 등)를 빼고 빈도 높은 일반 단어 56개(pria, wanita, kemudian, tubuh, udara, gagal, biaya, ujian 등)로 바꿨다.
- 결과: 250개 중 126개가 빈도표 3000위 안, 217개가 10000위 안. 빈도표에 없는 10개는 자막엔 안 나오지만 생활 구어에서 아주 흔한 말(ribet, gengsi, pede, jajan, deg-degan, mudik, lebaran, angkot, puskesmas, meriang).
- 순서는 빈도순 (구어형은 표준형의 순위, 빈도표에 없는 말은 맨 뒤). CSV의 Rank_Source에 순위를 적었다.
- 이미 있는 단어(철자·표준형)와 겹치지 않게 검사했다. 예문·표현에 그 단어가 들어 있는지는 `packs.test.ts`가 검사한다.
- 현지인 검증은 아직 안 했다. 특히 구어 동사형(ngomongin, nyamperin, ngambek, nyasar), 종교 표현(alhamdulillah, amin), 예문 전체.

## 다음 단계 (요청서 9번)

1. 직접 써 보거나 현지인에게 보여 주고, 어색한 뜻·예문·빠진 단어를 알려 주세요.
2. 더 늘릴 때는 꾸러미 맨 뒤에 붙인다 (중간에 끼우거나 순서를 바꾸면 이미 받은 덱에서 "새 단어 받기"가 어긋난다).
   두 번째 묶음에서 뺀 118장(추상 명사, 중복형 등)이 다음 후보다.
