# 利用している他者の著作物

ボイシング道場（Voicing Dojo）は、次のソフトウェアを使っています。著作権は各権利者にあり、
各ライセンスに従って利用しています。これらは LICENSE の「All rights reserved」の対象外です。

## 同梱しているもの

なし。

## 外部から読み込んでいるもの（同梱していない）

| 名前 | 用途 | 提供元・権利者 | ライセンス |
|---|---|---|---|
| Tone.js 14.8.49 | 音の再生（演奏音・伴奏・ドラムの合成） | Yotam Mann（cdnjs から読み込み） | MIT License |

- Tone.js の配布ファイル（`Tone.js`）には、依存ライブラリ standardized-audio-context（Christoph Guttandin、MIT License）が
  取り込まれている可能性が高い（推測：ミニファイ済みで名前は残っていないが、同ライブラリ特有の処理が含まれる）。
  ほかの依存は automation-events（MIT License）、tslib（0BSD）。
- アプリとして Tone.js を同梱して配布するときは、Tone.js と取り込まれた依存ライブラリのライセンス文を `vendor/` に加えること。
  Tone.js のライセンス文は https://github.com/Tonejs/Tone.js/blob/main/LICENSE.md にある。

## フォント・画像・音源

- フォント：Web フォントは読み込んでいない。CSS で指定した名前（Inter、Noto Sans JP、system-ui など）は、端末に入っているものを使う。
- 画像・アイコン：なし（ボタンの記号は端末の絵文字・文字を使う）。
- 音源：サンプル音源はなし。音はすべて Tone.js で合成している。
