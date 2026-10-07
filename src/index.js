const { twoApprox, solve } = require('./two-approx.js');
const { greedy } = require('./greedy.js');
const { mgreedy, tgreedy } = require('./blum.js');
const { exact } = require('./exact.js');
const { naive } = require('./naive.js');

// Every algorithm takes an array of strings and returns a common superstring.
// `solve` returns { superstring, lowerBound, fallback } for the 2-approximation.
module.exports = { twoApprox, solve, greedy, mgreedy, tgreedy, exact, naive };
