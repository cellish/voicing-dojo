// 実行：node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, playCourseStep } from './harness.mjs';

// アプリは vm の別環境で動くので、配列は JSON 経由でこちらの環境の値にしてから比べる
const plain = (x) => JSON.parse(JSON.stringify(x));
const stepIndex = (key) => loadApp().T.COURSE_STEPS.findIndex(s => s.key === key);

test('コースは仕様どおり 4 / 3 / 5 / 1 ステップ', () => {
    const { T } = loadApp();
    const counts = [1, 2, 3, 4].map(p => T.COURSE_STEPS.filter(s => s.phase === p).length);
    assert.deepEqual(plain(counts), [4, 3, 5, 1]);
});

test('ノーミスで 12 キーを制覇できる（メジャー ii-V-I、3和音）', () => {
    const app = loadApp();
    const r = playCourseStep(app, stepIndex('p1-maj'));
    assert.equal(r.done, true);
    assert.equal(r.chords, 4 * 12);
    assert.ok(r.state.keyStatuses.every(s => s === 'perfect'));
});

test('ミスするとそのキーの1コード目からやり直し、12キー後に復習する', () => {
    const app = loadApp();
    // 王道進行の1キー目、3コード目をわざと弾かない：
    // 2コード + ミス1 + やり直し4 + 残り11キー×4 + 復習4 = 55
    const r = playCourseStep(app, stepIndex('p1-pop'), { missAt: 2 });
    assert.equal(r.done, true);
    assert.equal(r.chords, 55);
    assert.ok(r.state.keyStatuses.every(s => s === 'perfect'), '復習でノーミスなら緑に戻る');
});

test('丸サ進行（2拍のコードを含む）とルートレスの5和音を通しプレイできる', () => {
    const app = loadApp();
    assert.equal(playCourseStep(app, stepIndex('p3-citypop')).done, true);
    assert.equal(playCourseStep(app, stepIndex('p4-citypop')).done, true);
});

test('カノンのベースはどのキーでも同じ形（ド-シ-ラ-ソ-ファ-ミ-ファ-ソ の順次下行）', () => {
    const app = loadApp();
    playCourseStep(app, stepIndex('p1-canon'));
    const bass = app.audioLog.filter(a => a[0] === 'bass').map(a => Math.round(12 * Math.log2(a[1] / 440) + 69));
    for (let k = 0; k + 8 <= bass.length; k += 8) {
        const seg = bass.slice(k, k + 8);
        assert.deepEqual(plain(seg.slice(1).map((v, i) => v - seg[i])), [-1, -2, -2, -2, -1, 1, 2]);
        assert.ok(Math.min(...seg) >= 36 && Math.max(...seg) <= 55, 'ベースの音域');
    }
});

test('コード名は調に沿って綴る（G♭メジャーの IV は C♭、G♯m の V は D♯7）', () => {
    const { T } = loadApp();
    const cfg = T.state().config;
    const labelsIn = (song, keyName, diff = 'intermediate') => {
        const meta = T.SONG_META[song];
        cfg.song = song; cfg.diff = diff; cfg.mode = 'full';
        cfg.cofIdx = meta.keyOrder.find(i => (meta.isMinor ? T.CIRCLE_OF_FIFTHS[i].min : T.CIRCLE_OF_FIFTHS[i].maj) === keyName);
        return T.PROGRESSIONS[song].map(c => T.buildChordTarget(c));
    };
    assert.deepEqual(plain(labelsIn('pop', 'Gb').map(d => d.label)), ['Cbmaj7', 'Db7', 'Bbm7', 'Ebm7']);
    assert.deepEqual(plain(labelsIn('passacaglia', 'G#m').map(d => d.label)),
        ['G#m7', 'C#m7', 'F#7', 'Bmaj7', 'Emaj7', 'A#m7(b5)', 'D#7', 'G#m7']);
    // 構成音名もコード名の綴りに合わせる
    assert.equal(labelsIn('pop', 'Gb')[0].hintText, 'ド♭・ミ♭・ソ♭・シ♭');
    assert.equal(labelsIn('passacaglia', 'G#m')[6].hintText, 'レ♯・ファ♯♯・ラ♯・ド♯');
});

test('ガイドトーンは音程で選ぶ（iiø7 は 3度・♭5・7度）', () => {
    const { T } = loadApp();
    const cfg = T.state().config;
    Object.assign(cfg, { song: 'passacaglia', diff: 'intermediate', mode: 'guide', cofIdx: T.SONG_META.passacaglia.keyOrder[0] });
    const iiHalfDim = T.buildChordTarget(T.PROGRESSIONS.passacaglia[5]); // Am7(b5)
    assert.deepEqual(plain(iiHalfDim.required), [0, 3, 7]); // C, E♭, G
});

test('表示時間は画面の高さ・テンポによらず一定（低い画面で短いコードが続くときだけ縮める）', () => {
    const app = loadApp();
    const { T } = app;
    const container = app.elements['game-container'];
    const secondsAt = (height, stepKey, bpm) => {
        container.clientHeight = height;
        T.resizeApp();
        T.startCourseStep(stepIndex(stepKey));
        T.state().config.bpm = bpm;
        return T.getLookaheadBeats() * 60 / bpm;
    };
    assert.ok(Math.abs(secondsAt(700, 'p1-maj', 80) - 2.8) < 1e-9);
    assert.ok(Math.abs(secondsAt(300, 'p1-maj', 140) - 2.8) < 1e-9);
    assert.ok(secondsAt(180, 'p3-citypop', 140) < 2.8);
});

test('判定幅は ±1/3拍、ただし 180〜350ms', () => {
    const { T } = loadApp();
    const cfg = T.state().config;
    const ms = (bpm) => { cfg.bpm = bpm; return T.getHitWindowBeats() * 60000 / bpm; };
    assert.equal(Math.round(ms(60)), 333);
    assert.equal(Math.round(ms(100)), 200);
    assert.equal(Math.round(ms(140)), 180);
});

test('保存済みの進捗を引き継ぐ（v3 の数値ID、旧 p2-autumn / p3-autumn）', () => {
    const v3 = loadApp({ storage: { chord_master_cleared_steps_v3: JSON.stringify([0, 4, 7, 12]) } });
    assert.deepEqual(plain([...v3.T.state().clearedSteps].sort()), ['p1-maj', 'p2-passacaglia', 'p4-citypop']);
    const renamed = loadApp({ storage: { chord_master_cleared_steps_v4: JSON.stringify(['p1-maj', 'p2-autumn', 'p3-autumn']) } });
    assert.deepEqual(plain([...renamed.T.state().clearedSteps].sort()), ['p1-maj', 'p2-passacaglia', 'p3-passacaglia']);
});
