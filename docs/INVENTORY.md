# INVENTORY — Voicing Dojo（chord-shooter）

道場シリーズの共通部品（書法コア）検討用の一覧。2026-11-25 時点の `index.html` を読んで確認した内容。
推測は「（推測）」と明記。行番号は目安（同日時点）。

---

## 1. 概要

- **アプリ名**: Voicing Dojo（旧称 Chord Master。フォルダ名は `chord-shooter`）
- **目的**: 上から降りてくるコードを判定ラインで鍵盤で弾き、コード進行のボイシング（押さえ方）と声部の動きを全12キーで練習する。
- **主な機能**
  - 12キー制覇コース（全13ステップ・4フェーズ、ミスしたキーは最後に自動復習）… `COURSE_STEPS`, `handleKeyCleared`
  - フリー練習（進行・キー・難易度・ボイシング・BPM・周回・表示時間・耳コピを設定）… `startFreeSession`
  - 3種のボイシング判定: フル / ガイドトーン / ルートレス … `buildChordTarget`, `tryJudgeHit`
  - 6種の進行: メジャー ii-V-I、マイナー ii-V-i、王道、カノン（オンコード）、枯葉サイクル、丸サ … `PROGRESSIONS`
  - 伴奏（ベース・ガイドトーン旋律・ドラム）、耳コピモード（コード名を隠してヒント音を再生）
  - テーマ（モダン＝既定・OS のライト/ダークに追従 / ネオン）… `applyTheme`
- **言語・フレームワーク**: 素の HTML / CSS / JavaScript（ES2020 程度、IIFE 1つ）。フレームワークなし。
- **ビルド**: なし（単一ファイルをそのままブラウザで開く）。
- **公開方法**: GitHub の公開リポジトリ `cellish/voicing-dojo`。GitHub Pages の設定・CI はリポジトリ内に**なし**。
- **ファイル構成**

| ファイル | 役割 |
|---|---|
| `index.html` | アプリ全体（CSS・HTML・JS をすべて含む。約3,500行） |
| `PROGRESS.md` | 作業ログと引き継ぎ |
| `docs/PLAN.md` | 設計判断とロードマップ |
| `docs/INVENTORY.md` | 本ファイル |
| `README.md` | 概要・使い方・ファイル構成・著作権と収録作品の権利の状態 |
| `LICENSE` | 著作権表示（All rights reserved、日英） |
| `THIRD_PARTY_NOTICES.md` | 利用している他者のソフトウェア（Tone.js） |

テストコードはリポジトリ内に**なし**。

---

## 2. 音楽データの表し方（最重要）

### 音高
- **内部はすべて整数**。区別して2種類を使う。
  - **ピッチクラス（0〜11、C=0）**: コード構成音・ルート・判定に使う。`notes: [2, 5, 9]` など。`mod12()` で正規化。
  - **MIDI 番号（0〜127）**: 伴奏のベース（`bassMidi`）・旋律（`melMidi`）、入力された鍵盤（`pressNote(midiNote, …)`）。周波数は事前計算表 `MIDI_FREQ_TABLE`（Float32Array）。
- **異名同音は内部で区別しない**（C♯ と D♭ は同じ 1）。綴りは**表示の段階でだけ**決める。
  - コード名: `spellInKey()` が調の主音の文字（C,D,E…）から度数で綴る（G♭メジャーの IV → `Cb`）。±2以上の臨時記号になる場合は `NOTE_NAMES_SHARP/FLAT` にフォールバック。
  - キー名: `CIRCLE_OF_FIFTHS` の表に文字列で持ち、`prettyKeyName()` で b/# を ♭/♯ 記号に変換。
  - 構成音ヒント（ド・レ…）: `getPcName(pc, useFlat)` で調ごとの ♯系/♭系の切り替えのみ（調に沿った綴りはしない）。
  - 音名→ピッチクラスの表: `NOTE_TO_PC`（`C#` と `Db` の両方を持つ）。

### 音価・拍・小節
- 個々の音符の音価は**持たない**。単位は「1コードが何拍続くか」だけ。
  - コード定義の `beats`（省略時 `BEATS_PER_CHORD = 4`）。丸サ進行の vm7・I7 だけ `beats: 2`。
- 時間軸は**拍の実数**（`currentBeat`）で進め、BPM（`config.bpm`）で秒に換算。
- 小節は明示的なデータなし。**4/4 拍子を暗黙の前提**にしている（ドラムが `nextClickBeat % 4` で小節頭を判定、カウントインを4拍単位で計算）。

### 声部
- 複数声部の楽譜データは**なし**。
- 伴奏はコードごとに**ベース1音（`bassMidi`）と旋律1音（`melMidi`）**だけを持つ。
- ユーザーが弾く和音の声部配置は自由で、データとしては押鍵中の MIDI 番号の集合（`noteSources` の Map）として扱う。
- 声部進行の評価は「前の和音の各音から最寄り音までの平均半音距離」（`tryJudgeHit` 内、`lastPlayedMidiNotes`）。声部の対応付け（どの音がどの声部か）はしない。

### 和音
- **コードネーム**: 文字列 `label` / `label_int` / `label_adv`（3和音 / 4和音 / 5和音）。移調時に正規表現 `CHORD_LABEL_REGEX`（ルート・種類・`/ベース`）で分解して書き換える … `transposeChordLabel`
- **ローマ数字**: 文字列 `deg` / `deg_int` / `deg_adv`。表示専用で、計算には使わない。オンコードは `V on 7`（算用数字＝ベースの音階度数）。進行全体の度数表記は `getDegreeText()` が生成。
- **構成音**: ピッチクラス配列 `notes` / `seventh` / `ninth`。ルートは `root`（難易度で変わる場合は `root_int` など）。
- **数字付き低音**: **なし**。
- コード種類の解析（文字列から構成音を作る機能）は**なし**。構成音はすべて手書きのデータ。

### 調・転調
- 調は `CIRCLE_OF_FIFTHS`（12要素）の要素で表す: `tonicPc`、長調/短調それぞれの表示名・調号・♭系かどうか。
- 進行データは原調（C または Am、`SONG_META.baseTonicPc`）で書き、半音数 `shift` を足して移調 … `buildChordTarget`
- 移調時、伴奏のベース・旋律は**進行全体を同じオクターブだけ**ずらして音域（`BASS_RANGE` 36–55、`MELODY_RANGE` 55–79）に収める … `fitOctaveShift`, `getRangeShifts`
- 「転調」は**周回ごとのキー変更**（五度圏順に次のキーへ）だけ … `transitionToCourseKey`。進行の途中での転調（借用和音・セカンダリードミナント）は度数ラベルで表すだけで、調としては扱わない。

### データの例（`PROGRESSIONS.citypop` の一部）

```js
{ label: 'Gm', label_int: 'Gm7', label_adv: 'Gm9',
  deg: 'v', deg_int: 'vm7', deg_adv: 'vm9',
  bassMidi: 43, root: 7,
  notes: [7, 10, 2], seventh: [7, 10, 2, 5], ninth: [7, 10, 2, 5, 9],
  melMidi: 65, beats: 2 }
```

難易度ごとの上書き（カノンの7番目: 3和音は IV、4和音以上は ii7 でベースも変わる）:

```js
{ label: 'F', label_int: 'Dm7', deg: 'IV', deg_int: 'iim7',
  bassMidi: 41, bassMidi_int: 38, root: 5, root_int: 2, ... }
```
`resolveChordDef(chordDef, diff)` が `_int` / `_adv` の付いた項目で上書きした1つのオブジェクトにまとめる。

調の表（`CIRCLE_OF_FIFTHS` の1要素）:

```js
{ tonicPc: 10, maj: 'Bb', majFull: 'Bb Major', majSig: '♭2', majFlat: true,
  min: 'Bbm', minFull: 'Bb Minor', minSig: '♭5', minFlat: true }
```

進行のメタ情報（`SONG_META`）:

```js
autumn: { name: '枯葉サイクル', isMinor: true, baseTonicPc: 9, keyOrder: AM_START_ORDER }
```
`keyOrder` は `CIRCLE_OF_FIFTHS` の添字の並び（`C_START_ORDER` = C→F→B♭…、`AM_START_ORDER` = Am→Dm→Gm…）。

コースのステップ（`COURSE_STEPS` の1要素）:

```js
{ id: 9, key: 'p3-pop', phase: 3, title: '王道進行（4和音）', song: 'pop',
  diff: 'intermediate', mode: 'full', badge: '4和音・フル', bpm: 85,
  goal: '…', mission: '…' }
```
`key` は保存用の固定ID。`diff` は `beginner|intermediate|advanced`、`mode` は `full|guide|rootless`。

判定用に作られる1コード分の目標（`buildChordTarget` の戻り値、移調済み）:

```js
{ label, degree, beats, root, required: [pc…], requiredSet, optionalSet,
  fullNotes: [pc…], hintText: 'レ・ファ・ラ・ド', bassMidi, bassPc, melMidi }
```

### ゲーム進行の流れ（コースモード）

1. `startCourseStep` → `launchSession` → `resetTimelineState`（カウントイン後に1コード目）
2. 毎フレーム `updateTimeline(dt)`: 拍を進める → ドラム・伴奏を予約 → 表示時間ぶん先のコードを `spawnNextBlock` → 判定幅内のブロックを `tryJudgeHit`
3. 判定幅を過ぎても押せなければ MISS → `restartProgressionAt` でそのキーの1コード目からやり直し（`hadMissInCurrentKey = true`）
4. 連続成功が「進行の長さ × 周回数」に達したら `handleKeyCleared` → 次のキーへ `transitionToCourseKey`（待機なし）
5. 12キー後、ミスしたキー（`reviewQueue`）だけ復習 → 全部ノーミスで `finishSession` → `openResultModal`

---

## 3. 機能ごとの実装

| 項目 | 有無 | 場所・作り |
|---|---|---|
| 楽譜表示 | **なし** | 五線譜は描かない。Canvas に「度数バッジ＋コード名＋構成音名」のブロックを描く … `drawFrame`, `roundRectPath`, `fitFont` |
| MIDI入力 | あり | Web MIDI API … `requestMIDI`, `updateMidiDevices`, `onMIDIMessage`。全入力ポート・全チャンネルの Note On/Off のみ処理（ベロシティ0の Note On も Off 扱い）。ホットプラグは `onstatechange` で再割り当て。サステインペダル（CC64）・ベロシティによる音量は**なし** |
| 画面鍵盤・PCキー | あり | `buildKeyboard`（1.5/2/3オクターブを画面幅で切替）、`handleTouchEvent`（`targetTouches`、`elementFromPoint` でスライド対応）、マウス、PCキー `PC_KEY_OFFSETS`（A〜L） |
| 音の再生 | あり | Tone.js 14.8.49 … `initAudio`, `createAudioGraph`。`PolySynth`（演奏音・ヒント）、`Synth`（旋律）、`FMSynth`（ベース）、`MembraneSynth`/`NoiseSynth`（ドラム）。`Tone.getContext().lookAhead = 0` にし、伴奏・ドラムは約60ms先を自前で予約 … `scheduleAccompaniment`, `updateTimeline`, `audioTimeAtBeatOffset`。サンプル音源は**なし**（すべて合成音） |
| マイク入力・音高判定 | **なし** | — |
| 音程・コード・調の計算 | 一部 | `mod12`, `transposeChordLabel`, `spellInKey`, `pickGuideTones`（ルートからの音程で3度・7度を選ぶ）, `resolveChordDef`。和音の識別（押鍵からコード名を判定）は**なし**。判定は「必須音の集合を全部押しているか」のみ |
| 規則の判定と採点 | あり | `tryJudgeHit`: 必須音（`requiredSet`）を全部含み、余分な音1つまで許容。フル＝最低音がベースなら100点/転回形50点、ガイド・ルートレス＝平均移動≤2.5半音で100点/50点、Just（±70ms）+20点。5音以上は完全5度を省略可。判定幅 `getHitWindowBeats`（±1/3拍、180〜350ms）。禁則（並行5度など）の判定は**なし** |
| 課題・問題データ | あり | すべて `index.html` 内の JS 定数: `PROGRESSIONS`（進行）、`SONG_META`（名前・長短・原調・キー順）、`COURSE_PHASES` / `COURSE_STEPS`（コース）。外部ファイル・JSON は**なし** |
| ファイル読み込み・書き出し | **なし** | MusicXML・MIDI ファイル・JSON の入出力なし |
| 言語切替 | **なし** | 日本語のみ（`<html lang="ja">`）。UI 文言は HTML と JS に直書き |
| 保存 | あり | localStorage: `chord_master_cleared_steps_v4`（クリア済みステップの固定ID配列）、`chord_master_cleared_steps_v3`（旧形式、読み込み時に移行のみ）、`chord_master_prefs_v1`（フリー設定・周回数・表示時間・オクターブ・ビート/メロディ・テーマ）… `loadClearedSteps`, `saveClearedSteps`, `savePrefs`, `loadPrefs`。`<head>` 内のインラインスクリプトもテーマを先読み |
| PWA・オフライン | **なし** | manifest・Service Worker なし。Tone.js を CDN から読むためオフラインでは音が出ない（推測：画面自体は開ける） |
| 著作権表示 | あり | `LICENSE`（All rights reserved）、`THIRD_PARTY_NOTICES.md`、`README.md` の「著作権・ライセンス」（収録進行ごとの権利の状態）、ホーム画面下部の `<footer class="app-foot">`。コードのコメントにも「旋律はオリジナルのガイドトーン・ライン（原曲旋律は不使用）」（`PROGRESSIONS.autumn` の直前） |

その他の機能:
- テーマ: CSS 変数＋`html[data-theme="modern"|"retro"]`、Canvas は `CANVAS_THEMES`（retro / modernLight / modernDark）… `applyTheme`, `buildFonts`
- アクセシビリティ: `aria-pressed`、`inert`、読み上げ通知 `announce()`（`#sr-live`）、キーボード操作時のみフォーカス枠

---

## 4. 依存関係

| ライブラリ | 版 | 読み込み方 |
|---|---|---|
| Tone.js | 14.8.49 | CDN（`https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js`）、`<script>` で同期読み込み |

- npm・`package.json`・同梱ライブラリ（vendor）は**なし**。
- フォント: CSS で `Inter` / `Noto Sans JP` / `system-ui` などを指定するが、Web フォントの読み込みは**なし**（端末にあるものを使う）。
- **他アプリからコピーしたコード**: コード内に出典・コピー元を示すコメントは**なし**。確認できる範囲では不明。
  - 同じ親フォルダ（`music-dojo/`）に `harmony-dojo`, `gradus-dojo`, `reharm-dojo`, `phrasing-dojo`, `adlib-dojo` があるが、本調査では中身を読んでいない。

---

## 5. 共通化の候補

### 他の音楽アプリでも使えそうな部分

| 部分 | 関数・定数 | 理由 |
|---|---|---|
| ピッチクラス・音名の基本表 | `mod12`, `NOTE_TO_PC`, `NOTE_NAMES_SHARP/FLAT`, `PC_NAMES_SHARP/FLAT`, `MIDI_FREQ_TABLE` | どの音楽アプリでも必要で、アプリ固有の前提がない |
| 調の表 | `CIRCLE_OF_FIFTHS`（長調/短調の名前・調号・♭系フラグ） | 移調・表示に共通。ただし短調の綴り選択（A♭m ではなく G♯m）はこのアプリの判断 |
| 調に沿った綴り | `spellInKey`, `transposeChordLabel`, `CHORD_LABEL_REGEX` | 異名同音の表示問題は他アプリでも起きる（推測）。ただし今は原調 C/Am の文字を基準にしているので、一般化には「原調の主音」を引数で渡す形が必要 |
| 音程によるガイドトーン抽出 | `pickGuideTones` | 構成音の並び順に依存せず、ルートからの音程だけで3度・7度を選ぶ。和声系アプリで再利用しやすい |
| 進行単位の音域合わせ | `fitOctaveShift` | 旋律・ベースの形を崩さずに音域へ収める汎用処理 |
| MIDI 入力 | `onMIDIMessage`, `updateMidiDevices`, `requestMIDI` | 小さく自己完結。ただし処理は Note On/Off のみ |
| 押鍵状態の管理 | `pressNote`, `releaseNote`, `releaseAllNotes`（入力元ごとの参照カウント `noteSources`） | MIDI・タッチ・マウス・PCキーを同じ形で扱える |
| 画面鍵盤 | `buildKeyboard`, `handleTouchEvent`, `getNoteFromPoint` | マルチタッチのスライド対応込みで汎用 |
| 音のタイミング | `lookAhead = 0`＋先行予約（`audioTimeAtBeatOffset`） | 演奏と伴奏を合わせる必要のあるアプリに共通の課題 |

### 共通化しにくい部分

| 部分 | 理由 |
|---|---|
| 和音データの形（`label/_int/_adv`、`notes/seventh/ninth`） | 「3和音/4和音/5和音」の難易度3段に特化した形で、和音を構成音の手書き配列で持つ。コード名や度数から構成音を計算しないので、一般的な和声データとしては情報が足りない／重複が多い |
| 時間の表し方 | 音価・小節・拍子を持たず「1コード＝N拍」と4/4前提だけ。楽譜表示や声部を扱うアプリとは単位が合わない |
| 判定と採点 | 「必須音の集合を押しているか」＋「最低音」＋「平均移動距離」というゲーム用の簡易判定。声部ごとの規則（並行5度・限定進行など）はない |
| コース・復習ロジック | `COURSE_STEPS`, `handleKeyCleared`, `reviewQueue` は12キー巡回ゲームの仕組みそのもの |
| Canvas 描画・テーマ | 落下型ゲームの画面に特化 |
| 伴奏の音色 | 合成音のみで、音源見直しが予定されている（PLAN.md Phase B） |

---

## 6. 既知の問題

- **CDN 依存**: Tone.js を CDN から読むため、オフライン・CDN 障害時に音が出ない。読み込み失敗時の案内もない（PLAN.md Phase B）。
- **構成音ヒントの綴り**: `getPcName` は ♯系/♭系の切り替えのみ。G♭メジャーで C♭ が「シ」と表示される（PLAN.md Phase C）。
- **異名同音の情報がデータにない**: 構成音がピッチクラスだけなので、正しい綴りを出すにはコード名やルートの文字から逆算する必要がある（`spellInKey` は原調の文字を手がかりにしている）。
- **4/4 拍子が暗黙の前提**: ドラムとカウントインが `% 4` 前提。3拍子などは扱えない。
- **度数ラベルとコード名が別々の手書き文字列**: 構成音・コード名・度数の3つが整合しているかを保証する仕組みはない（推測：データ追加時に食い違いが起きやすい）。
- **MIDI**: サステインペダル（CC64）・ベロシティを無視する。全チャンネルの入力を区別なく受ける。
- **耳コピのヒント**: 和音ヒントは構成音の先頭4音だけを C4〜B5 付近で鳴らす（5音目は鳴らない）… `spawnNextBlock`
- **保存キーが旧名称**（`chord_master_…`）: 既存の進捗を壊さないため意図的に維持。
- **テストがリポジトリにない**: 動作確認に使った Node スタブの通しプレイはリポジトリ外。自動テストはない。
- **TODO / FIXME コメント**: なし。
- **未検証**: iOS / iPad 実機での音と描画のずれ、タッチ操作、スクリーンリーダー。

---

## 7. 作者のメモ

### 共通にしたい部分：

### このアプリに残したい部分：
