# shortest-superstring-js

JavaScript implementations of algorithms for the **shortest common superstring**
problem: given a set of strings, find a shortest string that contains every one
of them as a contiguous substring. The problem is NP-hard, so the interesting
algorithms are approximations.

The centrepiece is the first polynomial-time algorithm proven to stay within
**twice the optimum**, from *A Polynomial-Time 2-Approximation for Shortest
Common Superstring* (September 2026), result 128 of
[openai/math](https://github.com/openai/math)
([paper](https://github.com/openai/math/blob/main/preprints/A-Polynomial-Time-2-Approximation-for-Shortest-Common-Superstring-September-24-2026/paper.pdf)).
The others are here to measure it against.

No dependencies; CommonJS; Node 18 or newer.

## Algorithms

| Function | Algorithm | Proven factor |
|---|---|---|
| `twoApprox` | The 2026 algorithm: forced occurrence counts, periodic layers, connections paid from a second budget | 2 |
| `greedy` | Greedy merge by largest overlap (Tarhio and Ukkonen 1988; Turner 1989) | 3.5 (Kaplan and Shafrir 2005) |
| `mgreedy` | Greedy cycle cover, cycles opened and concatenated (Blum et al. 1994) | 4 |
| `tgreedy` | MGREEDY's cycle strings merged by Greedy (Blum et al. 1994) | 3 |
| `exact` | Dynamic programming over subsets, up to 16 strings | 1 |
| `naive` | Concatenation of the inputs | -- |

```js
const { twoApprox, greedy, exact, solve } = require('./src');

twoApprox(['cde', 'abc', 'efg']);           // 'abcdefg'
solve(['cde', 'abc', 'efg']);
// { superstring: 'abcdefg', lowerBound: 7, fallback: false }
```

Every function takes an array of strings and returns a string. Empty strings,
duplicates and strings contained in another are dropped first. Symbols are
Unicode code points, so a surrogate pair is never split.

`solve` also returns `lowerBound`, the algorithm's lower bound *W* on the
optimum; the answer is never longer than *2W*. `fallback` is `true` only if an
internal invariant failed and the pieces were joined by plain round trips
instead -- the answer is still a superstring, but without the guarantee. The
tests and the benchmark fail if that ever happens, and it has not.

## How the 2-approximation works

1. Every distinct substring of the inputs, including the empty word, is a vertex
   of a *hierarchical graph*: an up edge appends a letter and costs one, a down
   edge deletes the first letter and costs nothing. An Euler tour from the empty
   word spells a superstring whose length is the number of up edges.
2. For every substring *s* a count *m(s)* is computed, longest first, that no
   common superstring can undercut: at least the counts of its one-letter
   extensions, at least one for an input, and a rule for periodic words -- if a
   word *v* of period *p* has an occurrence not "blocked" by a longer word, then
   its prefix shorter by *k* periods has *k + 1* unblocked occurrences. The
   one-letter counts sum to a lower bound *W*, and the counts define a balanced
   graph with *W* up edges.
3. That graph is split into closed walks, and the walks with the same periodic
   text are rearranged into *layers* that each go round one period. A layer of
   period *p* is given an extra budget *p*; the budgets sum to *W*.
4. The layers are connected to the empty word within those budgets: round
   trips, joins inside a period group, links to a window of another layer that
   the periodic rule guarantees, requests that a longer-period layer fulfils,
   and a rule that breaks cycles of links at the lexicographically greatest
   rotation.
5. The Euler tour of the result has at most *2W* letters.

Two finishing steps can only shorten the answer: added walks that connectivity
turns out not to need are dropped, and leading or trailing letters are trimmed
while every input still occurs.

The graph has one vertex per distinct substring, so time and memory grow with
the square of the total input length. A thousand 40-letter reads take about
90 ms.

## Benchmark

```sh
npm run bench          # full run, about 30 seconds; writes results/
npm run bench:quick    # a tenth of the instances
```

[`bench/instances.js`](bench/instances.js) generates four families -- random
strings over 4 and 26 letters, reads of a random genome, and strings cut from
repetitions of a few short seeds -- plus the textbook instance on which Greedy
approaches twice the optimum. Small instances (3 to 10 strings) are measured
against the exact optimum; large ones against the 2-approximation's lower bound
*W*. The latest run is in [`results/RESULTS.md`](results/RESULTS.md) and
[`results/results.json`](results/results.json).

What it shows, on an M4 Max:

- **On average, Greedy is usually better.** Its mean ratio is better in seven
  of the eight families, and on genome reads it is optimal on 98% of small
  instances against 74%. Two exceptions: on 200 random 4-letter strings the
  2-approximation wrote exactly *W* letters every time (provably optimal) while
  Greedy was 0.02% longer, and on small 4-letter instances it found the
  optimum more often (91% against 85%) despite a slightly worse mean.
- **It is not faster.** It is about ten times slower on small inputs and over a
  hundred times slower on 60 periodic strings. It wins on 1,000 genome reads
  (86 against 271 ms) only because `greedy` here computes all pairwise
  overlaps; a suffix-tree Greedy runs in near-linear time, while the
  2-approximation's graph grows with the square of the input length.
- **The guarantee is the difference.** On `{c(ab)^k, (ba)^k, (ab)^k c}` Greedy,
  MGREEDY and TGREEDY write *4k + 2* letters against an optimum of *2k + 4*; the
  2-approximation writes *2k + 6*.
- **The lower bound is tight on easy inputs** -- *W* averages 0.97 to 1.00 of
  the optimum -- so `solve` also certifies how far an answer can be from the best.

## Tests

```sh
npm test
```

The tests check every algorithm for a valid superstring on 1,200 random
instances, and the 2-approximation for *W <= OPT* and *length <= 2W*.

## Licence

MIT. See [LICENSE](LICENSE).
