// Ce a rămas din coada de cadre: din PROMPT-14 nu mai există nicio secvență de imagini (apusul de la început e randat
// live în WebGL, intro.js). Aici stau doar setul de mărimi (telefon / calculator) și semnalul „prima derulare”.

const conn = navigator.connection || {};
// telefon: ecran îngust, economie de date sau rețea lentă
export const SET = innerWidth < 768 || conn.saveData || /^(slow-2g|2g|3g)$/.test(conn.effectiveType || '') ? 'm' : 'd';
export const BASE = 'media/' + SET + '/';
export const dims = (x) => [x.naturalWidth || x.width, x.naturalHeight || x.height];

// treapta „moved”: după prima derulare a vizitatorului (abia atunci se descarcă hărțile planetelor)
let moved = false;
const moveFns = [];
export const onFirstMove = (fn) => { if (moved) fn(); else moveFns.push(fn); };
function firstMove() {
  if (moved) return; moved = true;
  ['wheel', 'touchmove', 'keydown', 'scroll'].forEach((t) => removeEventListener(t, onMove));
  moveFns.splice(0).forEach((fn) => fn());
}
const onMove = (e) => { if (e.type !== 'scroll' || scrollY > 2) firstMove(); };
['wheel', 'touchmove', 'keydown', 'scroll'].forEach((t) => addEventListener(t, onMove, { passive: true }));
export const started = () => moved;
export function stats() { return { set: SET, moved }; }
