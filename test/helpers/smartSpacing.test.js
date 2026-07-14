const test = require("node:test");
const assert = require("node:assert/strict");
const { applySmartSpacing } = require("../../src/helpers/smartSpacing.js");

test('applySmartSpacing prepend mode', () => {
  assert.equal(applySmartSpacing({ text: 'world', mode: 'prepend', precedingChar: 'o' }), ' world');
  assert.equal(applySmartSpacing({ text: ' world', mode: 'prepend', precedingChar: 'o' }), ' world');
  assert.equal(applySmartSpacing({ text: 'world', mode: 'prepend', precedingChar: '(' }), 'world');
  assert.equal(applySmartSpacing({ text: ', world', mode: 'prepend', precedingChar: 'o' }), ', world');
});

test('applySmartSpacing append mode', () => {
  assert.equal(applySmartSpacing({ text: 'Hello', mode: 'append' }), 'Hello ');
  assert.equal(applySmartSpacing({ text: 'Hello ', mode: 'append' }), 'Hello ');
});
