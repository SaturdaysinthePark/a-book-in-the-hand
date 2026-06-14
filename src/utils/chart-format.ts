// chart-format.ts — tiny, serialisable formatting helpers shared by the build-time
// (stats.astro frontmatter) and client-side chart renderers. formatTick/formatValue
// are functions and can't cross the JSON boundary to the browser, so charts carry
// string *kinds* instead and both sides rebuild the function from the same maps here.

export type TickKind = 'identity' | 'stars' | 'yearFromMonth' | 'none';
export type ValueKind = 'int' | 'pp' | 'rating1';

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

/** Rebuild an x-axis tick formatter from its kind. '' skips a tick. */
export function tickFn(kind: TickKind = 'identity'): (label: string, i: number) => string {
	switch (kind) {
		case 'stars': return (l) => '★'.repeat(Number(l));
		case 'yearFromMonth': return (l) => (l.endsWith('-01') ? l.slice(0, 4) : '');
		case 'none': return () => '';
		default: return (l) => l;
	}
}

/** Rebuild a value formatter from its kind. */
export function valueFn(kind: ValueKind = 'int'): (n: number) => string {
	switch (kind) {
		case 'pp': return (n) => `${fmtInt(n)} pp`;
		case 'rating1': return (n) => n.toFixed(1);
		default: return fmtInt;
	}
}

/** Keep every `step`-th tick, blank the rest — used to thin dense axes on mobile. */
export function thinTicks(
	base: (label: string, i: number) => string,
	step: number,
): (label: string, i: number) => string {
	return (l, i) => (i % step === 0 ? base(l, i) : '');
}

/** Truncate a label to `n` characters with an ellipsis. */
export function truncate(s: string, n: number): string {
	return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}
