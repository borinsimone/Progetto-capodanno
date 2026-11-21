import test from 'node:test';
import assert from 'node:assert/strict';
import { safeLink, attendanceTotal } from '../src/validation.mjs';
test('confirmed attendance includes guests only for confirmed profiles', () => {
  assert.equal(attendanceTotal([{attendance:'yes',guests:2},{attendance:'maybe',guests:5},{attendance:'no',guests:2},{attendance:'yes',guests:0}]),4);
});
test('links exclude executable protocols and malformed URLs', () => {
  assert.equal(safeLink('javascript:alert(1)'),null);
  assert.equal(safeLink('data:text/html,test'),null);
  assert.equal(safeLink('www.example.com'),null);
  assert.equal(safeLink('https://example.com/chalet'),'https://example.com/chalet');
  assert.equal(safeLink(''),'');
});
