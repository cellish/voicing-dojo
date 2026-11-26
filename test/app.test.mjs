// 実行：node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, playCourseStep, playChallenge } from './harness.mjs';

// アプリは vm の別環境で動くので、配列は JSON 経由でこちらの環境の値にしてから比べる
const plain = (x) => JSON.parse(JSON.stringify(x));
const stepIndex = (key) => loadApp().T.COURSE_STEPS.findIndex(s => s.key === key);

test('コースは 5 / 4 / 6 / 4 ステップ', () => {
    const { T } = loadApp();
    const counts = [1, 2, 3, 4].map(p => T.COURSE_STEPS.filter(s => s.phase === p).length);
    assert.deepEqual(plain(counts), [5, 4, 6, 4]);
    assert.ok(T.COURSE_STEPS.every((s, i) => s.id === i), 'id は並び順と一致');
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
    assert.equal(r.state.keyStatuses[0], 'recovered', '復習でノーミスなら銀（復習で合格）');
    assert.ok(r.state.keyStatuses.slice(1).every(s => s === 'perfect'), 'ほかのキーは金（一発合格）');
});

test('循環進行の4ステップ（3和音・ガイドトーン・4和音・ルートレス）を通しプレイできる', () => {
    const app = loadApp();
    for (const key of ['p1-turnaround', 'p2-turnaround', 'p3-turnaround', 'p4-turnaround']) {
        const r = playCourseStep(app, stepIndex(key));
        assert.equal(r.done, true, key);
        assert.equal(r.chords, 4 * 12, key);
    }
});

test('丸サ進行（2拍のコードを含む）とルートレスの5和音を通しプレイできる', () => {
    const app = loadApp();
    assert.equal(playCourseStep(app, stepIndex('p3-citypop')).done, true);
    assert.equal(playCourseStep(app, stepIndex('p4-citypop')).done, true);
});

test('Phase 4 のメジャー・マイナー ii-V-I（ルートレス）を通しプレイできる', () => {
    const app = loadApp();
    for (const key of ['p4-maj', 'p4-min']) {
        const r = playCourseStep(app, stepIndex(key));
        assert.equal(r.done, true, key);
        assert.equal(r.chords, 4 * 12, key);
    }
});

test('ミスして弾き直しても点は増えない（やり直し区間の点を取り消し、復習は加点しない）', () => {
    const clean = playCourseStep(loadApp(), stepIndex('p1-pop'));
    const missed = playCourseStep(loadApp(), stepIndex('p1-pop'), { missAt: 2 });
    assert.equal(missed.state.missCount, 1);
    assert.ok(missed.chords > clean.chords, 'ミスした方が多く弾いている');
    assert.equal(missed.state.score, clean.state.score - 100, 'それでも点はミス1回分（100点）低い');
    assert.equal(clean.state.missCount, 0);
    assert.equal(clean.state.maxCombo, 4 * 12, 'ノーミスなら全コードがコンボ');
});

test('ランク：ミス・Perfect 率・ジャスト率で決まる', () => {
    const { T } = loadApp();
    const r = (hits, perfect, just, misses) => T.computeRank({ hits, perfect, just, misses });
    assert.equal(r(48, 48, 40, 0), 'S');
    assert.equal(r(48, 48, 40, 1), 'A', 'ミスが1つあれば S にならない');
    assert.equal(r(48, 48, 10, 0), 'B', 'ジャスト率が低い');
    assert.equal(r(48, 30, 0, 0), 'C');
    assert.equal(r(0, 0, 0, 0), 'C');
});

test('結果画面で自己ベストを記録し、コース一覧に最高ランクを出す', () => {
    const app = loadApp();
    const step = stepIndex('p1-maj');
    playCourseStep(app, step);
    app.runPendingTimeout();
    const recs = JSON.parse(app.store.chord_master_records_v1);
    const rec = recs['course:p1-maj:laps1'];
    assert.ok(rec && rec.score > 0 && rec.combo === 48);
    assert.equal(app.elements['result-new'].classList.contains('hidden'), false, '初回は NEW RECORD');
    assert.equal(app.T.getStepBestRank('p1-maj'), rec.rank);

    // 2回目（同じ点）は NEW RECORD にならない
    playCourseStep(app, step);
    app.runPendingTimeout();
    assert.equal(app.elements['result-new'].classList.contains('hidden'), true);
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
    // 循環進行の VI7 はセカンダリードミナント（調の外の音を含む）
    assert.deepEqual(plain(labelsIn('turnaround', 'C').map(d => d.label)), ['Cmaj7', 'A7', 'Dm7', 'G7']);
    assert.equal(labelsIn('turnaround', 'C')[1].hintText, 'ラ・ド♯・ミ・ソ');
    assert.deepEqual(plain(labelsIn('turnaround', 'Gb').map(d => d.label)), ['Gbmaj7', 'Eb7', 'Abm7', 'Db7']);
    assert.equal(labelsIn('turnaround', 'Gb')[1].hintText, 'ミ♭・ソ・シ♭・レ♭');
    assert.deepEqual(plain(labelsIn('turnaround', 'C', 'advanced').map(d => d.label)), ['Cmaj9', 'A7(b9)', 'Dm9', 'G9']);
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

test('スピードアップ：キーごとに BPM +5、ミスしたら終了', () => {
    const app = loadApp();
    app.elements['ch-song'].value = 'ii_V_I_maj';
    app.elements['ch-level'].value = 'triad';
    // 4コード × 3キー をノーミスで弾き、4キー目の1コード目でミス
    const r = playChallenge(app, 'speed', { missAt: 12 });
    assert.equal(r.done, true);
    assert.equal(r.state.speedKeysCleared, 3);
    assert.equal(r.state.speedBestBpm, 70 + 5 * 2, '3キー目は BPM 80 でクリア');
    assert.equal(r.state.config.bpm, 85);
    app.runPendingTimeout();
    const rec = JSON.parse(app.store.chord_master_records_v1)['challenge:speed:ii_V_I_maj:triad'];
    assert.equal(rec.bpm, 80);
    assert.equal(rec.keys, 3);
});

test('耳コピチャレンジ：コード名を隠して12キー、制覇で実績', () => {
    const app = loadApp();
    app.elements['ch-song'].value = 'pop';
    app.elements['ch-level'].value = 'seventh';
    app.elements['ch-hint'].value = 'chord';
    const r = playChallenge(app, 'ear');
    assert.equal(r.done, true);
    assert.equal(r.chords, 4 * 12);
    assert.equal(r.state.config.blindMode, 'chord');
    assert.ok(r.state.blocks.every(b => b.isBlind));
    app.runPendingTimeout();
    assert.ok(r.state.achievements.has('ear_clear'));
});

test('苦手キー克服：ミスの多いキーだけを出す', () => {
    const app = loadApp();
    const { T } = app;
    assert.deepEqual(plain(T.pickWeakKeyPositions('pop', 'beginner', 'full')), [], '記録がなければ無し');
    // 王道進行の3和音で1キー目をミス → そのキーが苦手に
    playCourseStep(app, stepIndex('p1-pop'), { missAt: 2 });
    // 1キー目はミス1・ノーミス1（復習）なので、まだ苦手ではない。もう一度ミスを記録する
    playCourseStep(app, stepIndex('p1-pop'), { missAt: 2 });
    const st = T.state().keyStats;
    assert.deepEqual(plain(st['pop|beginner|full|0']), { miss: 2, clean: 2 });
    st['pop|beginner|full|1'] = { miss: 3, clean: 0 }; // 五度圏の2番目＝F
    assert.deepEqual(plain(T.pickWeakKeyPositions('pop', 'beginner', 'full')), [1]);
    app.elements['ch-song'].value = 'pop';
    app.elements['ch-level'].value = 'triad';
    const r = playChallenge(app, 'weak');
    assert.equal(r.done, true);
    assert.equal(r.chords, 4 * 2, '1キー × 2周');
});

test('今日のドリル：1キー2周、クリアで今日の分が済み・連続日数が付く', () => {
    const app = loadApp();
    const d1 = app.T.getDailyDrill();
    assert.equal(d1.step.key, 'p1-maj', '未制覇なら最初のステップから選ぶ');
    assert.deepEqual(plain(app.T.getDailyDrill()), plain(d1), '同じ日は同じ課題');
    const r = playChallenge(app, 'daily');
    assert.equal(r.done, true);
    assert.equal(r.chords, 4 * 2);
    app.runPendingTimeout();
    assert.equal(app.T.getDailyDrill().done, true);
    assert.equal(app.T.getStreak(), 1);
    assert.ok(r.state.achievements.has('daily_1'));
});

test('連続日数：昨日練習していれば伸び、空いたら1から', () => {
    const pad = (n) => String(n).padStart(2, '0');
    const ds = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date();
    const yesterday = ds(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const longAgo = ds(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5));
    let app = loadApp({ storage: { chord_master_activity_v1: JSON.stringify({ last: yesterday, streak: 4, best: 4, total: 10 }) } });
    assert.equal(app.T.getStreak(), 4);
    app.T.recordActivityDay();
    assert.equal(app.T.getStreak(), 5);
    assert.equal(app.T.state().activity.total, 11);
    app = loadApp({ storage: { chord_master_activity_v1: JSON.stringify({ last: longAgo, streak: 4, best: 4, total: 10 }) } });
    assert.equal(app.T.getStreak(), 0);
    app.T.recordActivityDay();
    assert.equal(app.T.getStreak(), 1);
    assert.equal(app.T.state().activity.best, 4);
});
