# CLAUDE.md — ボイシング道場(Voicing Dojo)

コードを判定ラインで弾く12キー対応のボイシング練習アプリ(旧称 Chord Master)。`index.html` 1ファイル(ビルドなし)。
現状は `STATUS.md`、未完了の作業は `PLAN.md`、設計の決定は `docs/DESIGN.md`、中身の一覧は `docs/INVENTORY.md`。

## 構成と確かめ方
- `index.html`: アプリ全体(CSS・HTML・JS)。音は Tone.js(CDN)で合成。
- `test/`: `node --test`。`test/harness.mjs` が本体スクリプトを vm 上で DOM・Canvas・Tone.js のスタブとともに動かし、時間を手で進めて通しプレイを確かめる。コミットの前に通す。

## 守ること(壊しやすい所)
- **保存キーは旧名のまま**(`chord_master_*`)。変えると既存の進捗・設定が消える。
- **コースのフェーズの内部 `id` とステップの `key` は変えない**(実績 `phase_<id>` と進捗が対応している)。表示番号は `COURSE_PHASES.tag` から作る。
- 旋律は、公有の作品から書き起こしたものか、作者自身のガイドトーン線だけを収める。保護期間中の作品の旋律は収めない。収録を足したら THIRD_PARTY_NOTICES.md に権利の状態を書く。
- 判定・採点・ボイシングの仕様は `docs/DESIGN.md` が正。仕様を変えるときは、先に利用者と決めてから DESIGN.md を直す。
- 著作権は All rights reserved(オープンソースにしない)。

## ドキュメント更新
- 作業の終わりに STATUS.md を上書き更新（50行以内、updated を更新）
- 完了した作業は PLAN.md から削除し、STATUS の「実装済み」に要約
- 外部素材を追加・削除したら THIRD_PARTY_NOTICES.md を更新
- OS・ブラウザ対応が変わったら STATUS の os: と対応状況を更新（未確認を「対応」と書かない）
- 詳細方針は道場シリーズ親フォルダの DOCS-POLICY.md を参照
