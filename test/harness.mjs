// index.html のスクリプトを、ブラウザの代わりの最小限のスタブ（DOM・Canvas・Tone.js・localStorage）の上で動かす。
// ゲームの内部関数を __t として取り出し、時間を手で進めて通しプレイを試せるようにする。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const HTML_PATH = new URL('../index.html', import.meta.url);

// 本体スクリプト（<style> より後の最初の <script>）を取り出し、IIFE の最後に内部関数の公開を差し込む
function loadScript() {
    const html = readFileSync(HTML_PATH, 'utf8');
    const start = html.indexOf('<script>\n', html.indexOf('</style>')) + '<script>\n'.length;
    const end = html.lastIndexOf('</script>');
    let js = html.slice(start, end);
    const tail = js.lastIndexOf('})();');
    js = js.slice(0, tail) + `
    globalThis.__t = {
        startCourseStep, startFreeSession, startChallenge, buildKeyPlan, pickWeakKeyPositions, getDailyDrill, getStreak, recordActivityDay, updateTimeline, drawFrame, pressNote, releaseNote,
        buildChordTarget, getDegreeText, getHitWindowBeats, getLookaheadBeats, resizeApp, applyTheme, initAudio,
        transposeChordLabel, spellInKey, PROGRESSIONS, SONG_META, CIRCLE_OF_FIFTHS, COURSE_STEPS, COURSE_PHASES, ACHIEVEMENTS, badgeSvg, keyElements, computeRank, getStepBestRank,
        state: () => ({ currentBeat, hitStreak, targetStreak, blocks, courseOrderPos, keyStatuses, isReviewPhase,
                        reviewQueue, resultPending, score, config, clearedSteps,
                        combo, maxCombo, missCount, perfectCount, hitCount, records, heldNotes: Array.from(noteSources.keys()),
                        keyPlan, challengeType, speedKeysCleared, speedBestBpm, activity, keyStats, achievements })
    };
` + js.slice(tail);
    return js;
}

function makeElement() {
    const classes = new Set();
    return {
        style: {}, dataset: {}, children: [], value: '', checked: true, options: [], textContent: '', innerHTML: '',
        clientWidth: 400, clientHeight: 600, scrollWidth: 400, offsetLeft: 0, offsetWidth: 40, inert: false,
        classList: {
            add: (...cs) => cs.forEach(c => classes.add(c)), remove: (...cs) => cs.forEach(c => classes.delete(c)), contains: c => classes.has(c),
            toggle: (c, f) => { if (f === undefined) f = !classes.has(c); f ? classes.add(c) : classes.delete(c); }
        },
        addEventListener(type, f) { (this.listeners ||= {})[type] = f; }, contains(el) { return !!el && el.inKeyboard === true; }, setAttribute(k, v) { this['@' + k] = v; }, querySelector() { return null; },
        focus() {}, blur() {}, appendChild(c) { this.children.push(c); return c; },
        getContext() {
            // Canvas 2D：描画命令は何もしない。measureText だけ文字数に比例した幅を返す
            return new Proxy({}, {
                get: (t, k) => k === 'roundRect' ? undefined
                    : k === 'measureText' ? (txt) => ({ width: String(txt).length * 9 })
                    : (typeof k === 'string' && /^(fill|stroke|move|line|begin|save|restore|translate|scale|set|rect|clear)/.test(k)) ? () => {}
                    : t[k],
                set: (t, k, v) => { t[k] = v; return true; }
            });
        }
    };
}

// 単音シンセ（同時に1音）では、予約時刻が前の予約より前に戻ると実機の Tone.js で問題になるので検出する
class FakeSynth {
    constructor(name, mono, log) { this.name = name; this.mono = mono; this.log = log; this.last = -1; this.volume = { value: 0 }; }
    toDestination() { return this; }
    triggerAttackRelease(...args) {
        const t = args[args.length - 1];
        if (typeof t === 'number' && this.mono) {
            if (t < this.last) throw new Error(`${this.name}: 予約時刻が前の予約より前に戻った`);
            this.last = t;
        }
        this.log.push([this.name, ...args]);
    }
    triggerAttack() {} triggerRelease() {}
}

/**
 * アプリを読み込む。
 * @param {object} opts.storage  localStorage の初期内容（キー → 文字列）
 * @returns {{ T, clock, audioLog, setNow, elements }}
 */
export function loadApp({ storage = {}, width = 800 } = {}) {
    const elements = {};
    const getEl = (id) => elements[id] || (elements[id] = makeElement());
    // 起動時に値を読むセレクトは、有効な初期値を入れておく
    Object.assign(getEl('course-laps-select'), { value: '1' });
    Object.assign(getEl('free-song'), { value: 'ii_V_I_maj' });
    Object.assign(getEl('free-mode'), { value: 'full' });
    Object.assign(getEl('free-diff'), { value: 'beginner' });

    const store = { ...storage };
    const audioLog = [];
    let now = 0;
    const synth = (name, mono) => class extends FakeSynth { constructor() { super(name, mono, audioLog); } };

    const context = vm.createContext({
        console, Math, JSON, Number, String, Array, Object, Set, Map, Promise, Proxy, Float32Array, Error, RegExp, Infinity,
        document: {
            documentElement: { dataset: {} }, readyState: 'complete', hidden: false, activeElement: null,
            getElementById: getEl, createElement: makeElement, createDocumentFragment: makeElement,
            addEventListener() {}, elementFromPoint() { return null; }
        },
        window: { innerWidth: width, devicePixelRatio: 2, addEventListener() {} },
        navigator: {},
        performance: { now: () => 0 },
        requestAnimationFrame: () => 1, cancelAnimationFrame() {},
        setTimeout: (f) => { context.__pendingTimeout = f; return 1; }, clearTimeout() {},
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
        Tone: {
            start: async () => {}, getContext: () => ({}), immediate: () => now,
            PolySynth: synth('poly', false), Synth: synth('melody', true), FMSynth: synth('bass', true),
            MembraneSynth: synth('kick', true), NoiseSynth: synth('hat', true)
        }
    });
    vm.runInContext(loadScript(), context, { filename: 'index.html' });
    // 結果画面を開く（setTimeout で待っている処理を実行する）
    const runPendingTimeout = () => { const f = context.__pendingTimeout; context.__pendingTimeout = null; if (f) f(); };
    return { T: context.__t, document: context.document, audioLog, store, elements, setNow: (v) => { now = v; }, runPendingTimeout };
}

/**
 * コースのステップを通しプレイする。判定ラインに来たコードを、指定ベース＋必須音で押さえる。
 * @param {number} missAt  この番目（0始まり）のコードだけわざと弾かない（-1 なら全部弾く）
 * @returns {{ done: boolean, chords: number, state: object }}
 */
export function playCourseStep(app, stepId, opts = {}) {
    app.T.startCourseStep(stepId);
    return playLoop(app, opts);
}

/** チャレンジを通しプレイする（missAt は playCourseStep と同じ） */
export function playChallenge(app, type, opts = {}) {
    app.T.startChallenge(type);
    return playLoop(app, opts);
}

function playLoop(app, { missAt = -1, maxSeconds = 4000, wrongForm = false, useHint = false } = {}) {
    const { T } = app;
    const dt = 1 / 60;
    let t = app.__t || 0;
    let chords = 0;
    let held = [];
    let skipped = null;
    for (let f = 0; f < maxSeconds * 60; f++) {
        const st = T.state();
        if (st.resultPending) { app.__t = t; return { done: true, chords, state: st }; }
        const b = st.blocks.find(x => !x.hit && !x.missed && x !== skipped && Math.abs(x.targetBeat - st.currentBeat) < 0.3);
        if (b && held.length === 0) {
            if (chords === missAt && !skipped) {
                skipped = b;
            } else {
                // A/B フォームは指定の音を一番下にして押さえる（wrongForm ならその次の音を下にする）
                const low = b.data.formLowPc === null ? null : (wrongForm ? b.data.required[1] : b.data.formLowPc);
                held = low === null ? [36 + b.data.bassPc, ...b.data.required.map(pc => 60 + pc)]
                    : b.data.required.map(pc => 48 + low + ((pc - low + 12) % 12));
                // useHint：鍵盤ヒントで色が付いた鍵だけを押さえる
                if (useHint) held = [...T.keyElements].filter(([, el]) => el.classList.contains('hint')).map(([n]) => n).sort((x, y) => x - y);
                held.forEach(n => T.pressNote(n, 'test'));
            }
            chords++;
        }
        if (held.length && !b) { held.forEach(n => T.releaseNote(n, 'test')); held = []; }
        t += dt;
        app.setNow(t);
        T.updateTimeline(dt);
        T.drawFrame();
    }
    app.__t = t;
    return { done: false, chords, state: T.state() };
}
