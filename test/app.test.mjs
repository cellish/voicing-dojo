// 実行：node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, playCourseStep, playChallenge } from './harness.mjs';

// アプリは vm の別環境で動くので、配列は JSON 経由でこちらの環境の値にしてから比べる
const plain = (x) => JSON.parse(JSON.stringify(x));
const stepIndex = (key) => loadApp().T.COURSE_STEPS.findIndex(s => s.key === key);

test('コースは表示順に 5 / 5 / 3 / 6 / 6 / 4 ステップ', () => {
    const { T } = loadApp();
    const counts = [1, 2, 6, 3, 4, 5].map(p => T.COURSE_STEPS.filter(s => s.phase === p).length);
    assert.deepEqual(plain(counts), [5, 5, 3, 6, 6, 4]);
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

test('ルートレスのメジャー・マイナー ii-V-I（ルートレス）を通しプレイできる', () => {
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
    assert.equal(labelsIn('pop', 'Gb')[0].hintText, 'Cb・Eb・Gb・Bb');
    assert.equal(labelsIn('passacaglia', 'G#m')[6].hintText, 'D#・F##・A#・C#');
    // 循環進行の VI7 はセカンダリードミナント（調の外の音を含む）
    assert.deepEqual(plain(labelsIn('turnaround', 'C').map(d => d.label)), ['Cmaj7', 'A7', 'Dm7', 'G7']);
    assert.equal(labelsIn('turnaround', 'C')[1].hintText, 'A・C#・E・G');
    assert.deepEqual(plain(labelsIn('turnaround', 'Gb').map(d => d.label)), ['Gbmaj7', 'Eb7', 'Abm7', 'Db7']);
    assert.equal(labelsIn('turnaround', 'Gb')[1].hintText, 'Eb・G・Bb・Db');
    assert.deepEqual(plain(labelsIn('turnaround', 'C', 'advanced').map(d => d.label)), ['Cmaj9', 'A7(b9)', 'Dm9', 'G9']);
});

test('ガイドトーンは音程で選ぶ（iiø7 の♭5はガイドトーンでは任意、シェルでは必須）', () => {
    const { T } = loadApp();
    const cfg = T.state().config;
    Object.assign(cfg, { song: 'passacaglia', diff: 'intermediate', mode: 'guide', cofIdx: T.SONG_META.passacaglia.keyOrder[0] });
    const iiHalfDim = T.buildChordTarget(T.PROGRESSIONS.passacaglia[5]); // Am7(b5)
    assert.deepEqual(plain(iiHalfDim.required), [0, 7]); // C, G
    assert.deepEqual(plain([...iiHalfDim.optionalSet]), [3]); // E♭
    assert.equal(iiHalfDim.hintText, 'C・G・(Eb)');
    cfg.mode = 'shell';
    assert.ok(T.buildChordTarget(T.PROGRESSIONS.passacaglia[5]).required.includes(3));
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

test('キーの順番：五度圏順・半音ずつ上がる順・ランダム', () => {
    const app = loadApp();
    const { T } = app;
    const names = (song, plan) => plan.map(pos => T.CIRCLE_OF_FIFTHS[T.SONG_META[song].keyOrder[pos]].maj);
    assert.deepEqual(plain(names('pop', T.buildKeyPlan('pop', 'fifths'))), ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'B', 'E', 'A', 'D', 'G']);
    assert.deepEqual(plain(names('pop', T.buildKeyPlan('pop', 'chromatic'))), ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']);
    // パッサカリアは原調（ト短調）から半音ずつ
    const pas = T.buildKeyPlan('passacaglia', 'chromatic').map(pos => T.CIRCLE_OF_FIFTHS[T.SONG_META.passacaglia.keyOrder[pos]].min);
    assert.equal(pas[0], 'Gm');
    assert.equal(pas[1], 'G#m');
    const rnd = T.buildKeyPlan('pop', 'random');
    assert.deepEqual(plain([...rnd].sort((a, b) => a - b)), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'ランダムでも12キーを1回ずつ');
    // 半音順でコースを通しプレイ：弾いたキーの順も半音ずつ
    app.elements['course-order-select'].value = 'chromatic';
    const r = playCourseStep(app, stepIndex('p1-maj'));
    assert.equal(r.done, true);
    assert.equal(r.chords, 4 * 12);
});

test('応用フェーズのジャズの定番進行を通しプレイでき、コード名は調に沿って綴る', () => {
    const app = loadApp();
    for (const key of ['p5-blues', 'p5-dominant', 'p5-tritone', 'p5-backdoor']) {
        const step = app.T.COURSE_STEPS[stepIndex(key)];
        const r = playCourseStep(app, stepIndex(key));
        assert.equal(r.done, true, key);
        assert.equal(r.chords, app.T.PROGRESSIONS[step.song].length * 12, key);
    }
    const { T } = app;
    const cfg = T.state().config;
    const labelsIn = (song, keyName) => {
        Object.assign(cfg, { song, diff: 'intermediate', mode: 'full' });
        cfg.cofIdx = T.CIRCLE_OF_FIFTHS.findIndex(c => c.maj === keyName);
        return T.PROGRESSIONS[song].map(c => T.buildChordTarget(c));
    };
    assert.deepEqual(plain(labelsIn('tritone_sub', 'E').map(d => d.label)), ['F#m7', 'F7', 'Emaj7', 'E6']);
    assert.equal(labelsIn('tritone_sub', 'C')[1].hintText, 'Db・F・Ab・Cb');
    assert.deepEqual(plain(labelsIn('backdoor', 'Eb').map(d => d.label)), ['Abm7', 'Db7', 'Ebmaj7', 'Eb6']);
    assert.deepEqual(plain(labelsIn('dominant_chain', 'F').map(d => d.label)), ['A7', 'D7', 'G7', 'C7', 'Fmaj7', 'F6']);
    assert.deepEqual(plain(labelsIn('blues', 'Bb').map(d => d.label).slice(0, 2)), ['Bb7', 'Eb7']);
    // ガイドトーン：♭II7 は V7 と同じ2音（3度と7度が入れ替わる）
    Object.assign(cfg, { song: 'tritone_sub', diff: 'intermediate', mode: 'guide', cofIdx: 0 });
    const g = T.buildChordTarget(T.PROGRESSIONS.tritone_sub[1]);
    assert.deepEqual(plain([...g.required].sort((a, b) => a - b)), [5, 11]);
});

test('シェル：ルート（指定ベース）＋3度＋7度、ルートが一番下で Perfect', () => {
    const app = loadApp();
    const { T } = app;
    Object.assign(T.state().config, { song: 'ii_V_I_maj', diff: 'intermediate', mode: 'shell', cofIdx: 0 });
    const req = plain(T.PROGRESSIONS.ii_V_I_maj.map(c => T.buildChordTarget(c).required));
    assert.deepEqual(req, [[2, 5, 0], [7, 11, 5], [0, 4, 11], [0, 4, 9]]); // Dm7 / G7 / Cmaj7 / C6
    // チャレンジのボイシングにも使える：4キーをノーミスで弾いて5キー目でミス
    app.elements['ch-song'].value = 'ii_V_I_maj';
    app.elements['ch-level'].value = 'shell';
    const r = playChallenge(app, 'speed', { missAt: 16 });
    assert.equal(r.state.config.mode, 'shell');
    assert.equal(r.state.speedKeysCleared, 4);
    assert.equal(r.state.perfectCount, 16, 'ハーネスはベース音を一番下に弾くので全部 Perfect');
});

test('シェルのフェーズ：ガイドトーンと4和音の間に3ステップ、通しプレイできる', () => {
    const app = loadApp();
    const { T } = app;
    assert.deepEqual(plain(T.COURSE_PHASES.map(p => [p.id, p.tag])),
        [[1, 'Phase 1'], [2, 'Phase 2'], [6, 'Phase 3'], [3, 'Phase 4'], [4, 'Phase 5'], [5, 'Phase 6']]);
    // ステップは表示順（フェーズの並び順）に並んでいる
    const order = T.COURSE_PHASES.map(p => p.id);
    const seq = T.COURSE_STEPS.map(s => order.indexOf(s.phase));
    assert.deepEqual(plain(seq), plain([...seq].sort((a, b) => a - b)));
    for (const key of ['ps-maj', 'ps-min', 'ps-turnaround']) {
        const r = playCourseStep(app, stepIndex(key));
        assert.equal(r.done, true, key);
        assert.equal(r.chords, 4 * 12, key);
        assert.equal(r.state.config.mode, 'shell', key);
        assert.equal(r.state.perfectCount, 4 * 12, key);
    }
});

test('保存済みの進捗と実績はフェーズを足しても対応がずれない', () => {
    const done = loadApp().T.COURSE_STEPS.filter(s => s.phase === 3).map(s => s.key);
    const app = loadApp({ storage: {
        chord_master_cleared_steps_v4: JSON.stringify(done),
        chord_master_achievements_v1: JSON.stringify(['phase_3'])
    } });
    assert.deepEqual(plain([...app.T.state().clearedSteps]), plain(done));
    const byId = Object.fromEntries(app.T.ACHIEVEMENTS.map(a => [a.id, a.title]));
    assert.equal(byId.phase_3, 'Phase 4 修了', '4和音のフェーズ（id 3）は表示上 Phase 4');
    assert.equal(byId.phase_6, 'Phase 3 修了', '新しいシェルのフェーズ');
    assert.equal(app.T.ACHIEVEMENTS.length, 20);
});

test('テーマ：保存した配色を引き継ぎ、どの配色でも描画できる', () => {
    for (const theme of ['modern', 'light', 'dark', 'soft', 'lavender', 'retro']) {
        const app = loadApp({ storage: { chord_master_prefs_v1: JSON.stringify({ theme }) } });
        assert.equal(app.elements['theme-select'].value, theme);
        app.T.startCourseStep(0);
        app.T.updateTimeline(1 / 60);
        app.T.drawFrame();
    }
});

test('Phase 2 のマイナー ii-V-i：2音で12キーを通せる', () => {
    const app = loadApp();
    const r = playCourseStep(app, stepIndex('p2-min'));
    assert.equal(r.done, true);
    assert.equal(r.chords, 4 * 12);
    assert.equal(r.state.config.mode, 'guide');
    assert.equal(r.state.missCount, 0);
});

test('すべての実績にバッジの絵がある（Phase 修了は表示上の番号）', () => {
    const { T } = loadApp();
    for (const a of T.ACHIEVEMENTS) assert.ok(!T.badgeSvg(a.id).includes('♪'), a.id);
    assert.ok(T.badgeSvg('phase_6').includes('>P3</text>')); // 内部 id 6 は表示上の Phase 3（シェル）
});

test('ルートレス A/B：C のメジャー ii-V-I の形と最低音（仕様の値）', () => {
    const { T } = loadApp();
    const cfg = T.state().config;
    Object.assign(cfg, { song: 'ii_V_I_maj', diff: 'advanced', mode: 'rootless_ab', cofIdx: T.SONG_META.ii_V_I_maj.keyOrder[0] });
    const targets = (start) => { cfg.formStart = start; return T.PROGRESSIONS.ii_V_I_maj.map((c, i) => T.buildChordTarget(c, i)); };
    const low = (d) => d.toneNames.get(d.formLowPc);
    const a = targets('A');
    assert.deepEqual(plain(a.map(d => d.form)), ['A', 'B', 'A', 'B']);
    assert.deepEqual(plain(a.map(low)), ['F', 'F', 'E', 'A']);
    assert.equal(a[0].hintText, 'F・A・C・E');
    const b = targets('B');
    assert.deepEqual(plain(b.map(d => d.form)), ['B', 'A', 'B', 'A']);
    assert.deepEqual(plain(b.map(low)), ['C', 'B', 'B', 'E']);
});

test('ルートレス A/B のコース：指定の形なら満点、最低音が違うと半分', () => {
    for (const key of ['p4-maj-ab', 'p4-maj-ba']) {
        const ok = playCourseStep(loadApp(), stepIndex(key));
        assert.equal(ok.done, true, key);
        assert.equal(ok.chords, 4 * 12, key);
        assert.equal(ok.state.perfectCount, 4 * 12, key);
        const ng = playCourseStep(loadApp(), stepIndex(key), { wrongForm: true });
        assert.equal(ng.done, true, key);
        assert.equal(ng.state.perfectCount, 0, key);
        assert.equal(ng.state.missCount, 0, key);
    }
});

test('ルートレス A/B：チャレンジとフリー練習で始まりの形を選べて、記録は別になる', () => {
    const app = loadApp();
    app.elements['ch-song'].value = 'ii_V_I_maj';
    app.elements['ch-level'].value = 'rootless_ab_b';
    const r = playChallenge(app, 'speed', { maxSeconds: 60 });
    assert.equal(r.state.config.mode, 'rootless_ab');
    assert.equal(r.state.config.formStart, 'B');
    const statKeys = Object.keys(r.state.keyStats);
    assert.ok(statKeys.length > 0);
    assert.ok(statKeys.every(k => k.includes('|rootless_ab_b|')));

    const free = loadApp();
    free.elements['free-mode'].value = 'rootless_ab_b';
    free.elements['free-diff'].value = 'advanced';
    free.T.startFreeSession();
    assert.equal(free.T.state().config.mode, 'rootless_ab');
    assert.equal(free.T.state().config.formStart, 'B');
});

test('音名の ON/OFF は保存した設定を引き継ぐ', () => {
    const app = loadApp({ storage: { chord_master_prefs_v1: JSON.stringify({ names: false }) } });
    assert.equal(app.T.state().config.namesOn, false);
    app.T.startCourseStep(0);
    app.T.updateTimeline(1 / 60);
    app.T.drawFrame();
    assert.equal(app.elements['btn-names-toggle'].textContent, '音名 OFF');
    assert.equal(app.elements['info-key-name'].textContent, 'C Major');
});
