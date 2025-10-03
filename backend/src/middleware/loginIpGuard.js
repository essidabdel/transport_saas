// src/middleware/loginIpGuard.js
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const ipFails = new Map();

function pushFail(ip){
  const now=Date.now();
  const arr=(ipFails.get(ip)||[]).filter(ts=>now-ts<WINDOW_MS);
  arr.push(now); ipFails.set(ip,arr);
}
function clearIp(ip){ ipFails.delete(ip); }
function isIpLocked(ip){
  const now=Date.now();
  const arr=(ipFails.get(ip)||[]).filter(ts=>now-ts<WINDOW_MS);
  ipFails.set(ip,arr);
  return arr.length>=MAX_FAILS;
}

module.exports = { pushFail, clearIp, isIpLocked };
