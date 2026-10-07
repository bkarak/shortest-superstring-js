// Benchmark harness. Writes results/RESULTS.md and results/results.json.
//
//   node bench/run.js            full run
//   node bench/run.js --quick    a tenth of the instances, for a smoke test

const fs = require('fs');
const os = require('os');
const path = require('path');

const algorithms = require('../src');
const { random, reads, periodic, greedyTrap } = require('./instances.js');

const QUICK = process.argv.includes('--quick');
const SMALL_COUNT = QUICK ? 30 : 300;
const LARGE_COUNT = QUICK ? 3 : 20;
const HEURISTICS = ['naive', 'greedy', 'mgreedy', 'tgreedy', 'twoApprox'];

function timed(fn) {
    const start = process.hrtime.bigint();
    const value = fn();
    return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

function check(name, strings, result) {
    for (const s of strings) {
        if (!result.includes(s)) {
            throw new Error(`${name} lost an input on ${JSON.stringify(strings)}`);
        }
    }
}

function median(xs) {
    const s = xs.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function summarise(ratios, times) {
    return {
        mean: ratios.reduce((a, b) => a + b, 0) / ratios.length,
        worst: Math.max(...ratios),
        optimal: ratios.filter((r) => r <= 1 + 1e-12).length / ratios.length,
        medianMs: median(times)
    };
}

// Small instances: every heuristic against the exact optimum.
const SMALL = [
    { family: 'random, 4 letters', make: (s) => random(s, 3 + (s % 8), 'ACGT', 3, 10) },
    { family: 'random, 26 letters', make: (s) => random(s, 3 + (s % 8), 'abcdefghijklmnopqrstuvwxyz', 3, 10) },
    { family: 'genome reads', make: (s) => reads(s, 4 + (s % 7), 60, 12) },
    { family: 'periodic', make: (s) => periodic(s, 3 + (s % 8), 24) }
];

// Large instances: no optimum, so the paper's lower bound W stands in for it.
// length / W is an upper bound on length / OPT.
const LARGE = [
    { family: 'random, 4 letters, n=200', make: (s) => random(s, 200, 'ACGT', 8, 20) },
    { family: 'genome reads, n=300, 1,000 bp', make: (s) => reads(s, 300, 1000, 30) },
    { family: 'genome reads, n=1,000, 2,000 bp', make: (s) => reads(s, 1000, 2000, 40) },
    { family: 'periodic, n=60', make: (s) => periodic(s, 60, 40) }
];

function runSmall() {
    const rows = [];

    for (const { family, make } of SMALL) {
        const ratios = Object.fromEntries(HEURISTICS.map((h) => [h, []]));
        const times = Object.fromEntries(HEURISTICS.map((h) => [h, []]));
        const W = [];

        for (let seed = 1; seed <= SMALL_COUNT; seed++) {
            const strings = make(seed);
            const opt = algorithms.exact(strings).length;

            for (const h of HEURISTICS) {
                const { value, ms } = timed(() => algorithms[h](strings));
                check(h, strings, value);
                ratios[h].push(opt === 0 ? 1 : value.length / opt);
                times[h].push(ms);
            }

            W.push(opt === 0 ? 1 : algorithms.solve(strings).lowerBound / opt);
        }

        rows.push({
            family,
            instances: SMALL_COUNT,
            lowerBoundOverOpt: { mean: W.reduce((a, b) => a + b, 0) / W.length, worst: Math.min(...W) },
            results: Object.fromEntries(HEURISTICS.map((h) => [h, summarise(ratios[h], times[h])]))
        });
    }

    return rows;
}

function runTrap() {
    const rows = [];

    for (const k of [2, 4, 8, 16, 32, 64]) {
        const strings = greedyTrap(k);
        const opt = algorithms.exact(strings).length;
        const row = { k, opt };

        for (const h of HEURISTICS) {
            const value = algorithms[h](strings);
            check(h, strings, value);
            row[h] = value.length;
        }

        rows.push(row);
    }

    return rows;
}

function runLarge() {
    const rows = [];

    for (const { family, make } of LARGE) {
        const ratios = Object.fromEntries(HEURISTICS.map((h) => [h, []]));
        const times = Object.fromEntries(HEURISTICS.map((h) => [h, []]));
        let fallbacks = 0;

        for (let seed = 1; seed <= LARGE_COUNT; seed++) {
            const strings = make(seed);
            const detail = algorithms.solve(strings);
            const W = detail.lowerBound;
            fallbacks += detail.fallback ? 1 : 0;

            for (const h of HEURISTICS) {
                const { value, ms } = timed(() => algorithms[h](strings));
                check(h, strings, value);
                ratios[h].push(value.length / W);
                times[h].push(ms);
            }
        }

        rows.push({
            family,
            instances: LARGE_COUNT,
            fallbacks,
            results: Object.fromEntries(HEURISTICS.map((h) => [h, summarise(ratios[h], times[h])]))
        });
    }

    return rows;
}

const f3 = (x) => x.toFixed(3);
const f1 = (x) => x.toFixed(1);
const pct = (x) => `${(100 * x).toFixed(1)}%`;
const ms = (x) => (x < 1 ? x.toFixed(3) : x < 100 ? x.toFixed(2) : x.toFixed(0));

function markdown(env, small, trap, large) {
    const out = [];
    const names = { naive: 'Concatenation', greedy: 'Greedy', mgreedy: 'MGREEDY', tgreedy: 'TGREEDY', twoApprox: '2-approx (2026)' };

    out.push('# Results', '');
    out.push(`Generated by \`node bench/run.js${QUICK ? ' --quick' : ''}\` on ${env.date}.`, '');
    out.push(`Machine: ${env.cpu}, ${env.cores} cores, ${env.platform}; Node ${env.node}. Times are medians of single runs per instance.`, '');

    out.push('## Small instances, against the exact optimum', '');
    out.push(`${SMALL_COUNT} instances per family, 3 to 10 strings each; the optimum is computed by dynamic programming. Ratio is length / optimum.`, '');

    for (const row of small) {
        out.push(`### ${row.family}`, '');
        out.push(`The 2-approximation's lower bound W averages ${f3(row.lowerBoundOverOpt.mean)} of the optimum (lowest ${f3(row.lowerBoundOverOpt.worst)}).`, '');
        out.push('| Algorithm | Mean ratio | Worst ratio | Optimal | Median time (ms) |');
        out.push('|---|---:|---:|---:|---:|');

        for (const h of HEURISTICS) {
            const r = row.results[h];
            out.push(`| ${names[h]} | ${f3(r.mean)} | ${f3(r.worst)} | ${pct(r.optimal)} | ${ms(r.medianMs)} |`);
        }

        out.push('');
    }

    out.push('## The Greedy trap', '');
    out.push('`{c(ab)^k, (ba)^k, (ab)^k c}`: lengths of the answers.', '');
    out.push(`| k | Optimum | ${HEURISTICS.map((h) => names[h]).join(' | ')} |`);
    out.push(`|---:|---:|${HEURISTICS.map(() => '---:').join('|')}|`);

    for (const row of trap) {
        out.push(`| ${row.k} | ${row.opt} | ${HEURISTICS.map((h) => row[h]).join(' | ')} |`);
    }

    out.push('');
    out.push('## Large instances, against the lower bound W', '');
    out.push(`${LARGE_COUNT} instances per family. The optimum is out of reach, so the ratio is length / W, where W is the 2-approximation's lower bound; it overstates every algorithm's true ratio by the same factor OPT / W.`, '');

    for (const row of large) {
        out.push(`### ${row.family}`, '');
        out.push('| Algorithm | Mean length / W | Worst length / W | Median time (ms) |');
        out.push('|---|---:|---:|---:|');

        for (const h of HEURISTICS) {
            const r = row.results[h];
            out.push(`| ${names[h]} | ${f3(r.mean)} | ${f3(r.worst)} | ${ms(r.medianMs)} |`);
        }

        out.push('');
    }

    return out.join('\n');
}

const env = {
    date: new Date().toISOString().slice(0, 10),
    cpu: os.cpus()[0].model,
    cores: os.cpus().length,
    platform: `${os.platform()} ${os.release()}`,
    node: process.version
};

const small = runSmall();
const trap = runTrap();
const large = runLarge();
const dir = path.join(__dirname, '..', 'results');

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ env, quick: QUICK, small, trap, large }, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'RESULTS.md'), markdown(env, small, trap, large) + '\n');
console.log(markdown(env, small, trap, large));
