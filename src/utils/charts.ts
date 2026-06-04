// charts.ts — tiny, dependency-free SVG chart builders. Each function returns an
// SVG *markup string*, with no reference to `document`/`window`, so the exact same
// code runs at build time (inlined into stats.astro) and on the client (the
// reading-over-time chart re-renders on toggle via el.innerHTML = barsSVG(...)).
//
// Colours are emitted as CSS custom properties in inline attributes
// (fill="var(--accent)"), so charts pick up the site palette and render identically
// whether inlined at build or injected at runtime — no scoped-CSS dependency.

export type Bar = { label: string; value: number };
export interface Stacked {
	keys: string[]; // bottom→top
	rows: { label: string; values: number[] }[];
}

// ── small utilities ───────────────────────────────────────────────────────────
const esc = (s: string) =>
	String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

/** Round a max value up to a "nice" axis ceiling that divides evenly into `ticks`. */
function niceMax(v: number, ticks = 4): number {
	if (v <= 0) return ticks;
	const raw = v / ticks;
	const mag = Math.pow(10, Math.floor(Math.log10(raw)));
	const norm = raw / mag;
	const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
	const step = nice * mag;
	return Math.ceil(v / step) * step;
}

function frame(inner: string, w: number, h: number, ariaLabel: string, title?: string, desc?: string): string {
	const a11y = `${title ? `<title>${esc(title)}</title>` : ''}${desc ? `<desc>${esc(desc)}</desc>` : ''}`;
	return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(ariaLabel)}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block;overflow:visible;font-family:var(--mono)">${a11y}${inner}</svg>`;
}

const AXIS = 'var(--muted)';
const RULE = 'var(--rule)';

// ── vertical bar chart (time series, simple) ────────────────────────────────────
export interface BarsOpts {
	width?: number;
	height?: number;
	color?: string;
	ariaLabel?: string;
	title?: string;
	desc?: string;
	showValues?: boolean;
	formatTick?: (label: string, i: number) => string; // '' to skip a tick
	formatValue?: (n: number) => string;
	yTicks?: number;
}

export function barsSVG(bars: Bar[], opts: BarsOpts = {}): string {
	const W = opts.width ?? 1000;
	const H = opts.height ?? 420;
	const color = opts.color ?? 'var(--accent)';
	const fmtV = opts.formatValue ?? fmtInt;
	const yTicks = opts.yTicks ?? 4;
	const padL = 50, padR = 16, padT = opts.showValues ? 30 : 16, padB = 36;
	const plotW = W - padL - padR, plotH = H - padT - padB;
	const n = Math.max(1, bars.length);
	const max = bars.reduce((m, b) => Math.max(m, b.value), 0);
	const nmax = niceMax(max, yTicks);
	const yOf = (v: number) => padT + plotH - (v / nmax) * plotH;
	const slot = plotW / n;
	const barW = Math.min(slot * 0.66, 48);

	let g = '';
	// y gridlines + labels
	for (let t = 0; t <= yTicks; t++) {
		const v = (nmax / yTicks) * t;
		const y = yOf(v);
		g += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="${RULE}" stroke-width="1"/>`;
		g += `<text x="${padL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="11" fill="${AXIS}">${fmtV(v)}</text>`;
	}
	// bars + x labels
	bars.forEach((b, i) => {
		const x = padL + i * slot + (slot - barW) / 2;
		const y = yOf(b.value);
		const bh = padT + plotH - y;
		g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" rx="1.5" fill="${color}"><title>${esc(b.label)}: ${fmtV(b.value)}</title></rect>`;
		if (opts.showValues && b.value > 0)
			g += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 7).toFixed(1)}" text-anchor="middle" font-size="11" fill="var(--ink-2)">${fmtV(b.value)}</text>`;
		const tick = opts.formatTick ? opts.formatTick(b.label, i) : b.label;
		if (tick)
			g += `<text x="${(x + barW / 2).toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="${AXIS}">${esc(tick)}</text>`;
	});
	return frame(g, W, H, opts.ariaLabel ?? opts.title ?? 'Bar chart', opts.title, opts.desc);
}

// ── vertical stacked bar chart (splits over time) ───────────────────────────────
export interface StackedOpts extends Omit<BarsOpts, 'color'> {
	colors?: string[]; // aligned to stacked.keys
	showTotals?: boolean;
}

export function stackedBarsSVG(data: Stacked, opts: StackedOpts = {}): string {
	const W = opts.width ?? 1000;
	const H = opts.height ?? 420;
	const colors = opts.colors ?? ['var(--accent)', 'var(--ink-2)'];
	const fmtV = opts.formatValue ?? fmtInt;
	const yTicks = opts.yTicks ?? 4;
	const padL = 50, padR = 16, padT = opts.showTotals ? 30 : 16, padB = 36;
	const plotW = W - padL - padR, plotH = H - padT - padB;
	const rows = data.rows;
	const n = Math.max(1, rows.length);
	const totals = rows.map((r) => r.values.reduce((a, v) => a + v, 0));
	const max = totals.reduce((m, t) => Math.max(m, t), 0);
	const nmax = niceMax(max, yTicks);
	const yOf = (v: number) => padT + plotH - (v / nmax) * plotH;
	const slot = plotW / n;
	const barW = Math.min(slot * 0.66, 48);

	let g = '';
	for (let t = 0; t <= yTicks; t++) {
		const v = (nmax / yTicks) * t;
		const y = yOf(v);
		g += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="${RULE}" stroke-width="1"/>`;
		g += `<text x="${padL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="11" fill="${AXIS}">${fmtV(v)}</text>`;
	}
	rows.forEach((r, i) => {
		const x = padL + i * slot + (slot - barW) / 2;
		let acc = 0;
		r.values.forEach((v, k) => {
			if (v <= 0) { acc += v; return; }
			const yTop = yOf(acc + v);
			const yBot = yOf(acc);
			g += `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, yBot - yTop).toFixed(1)}" fill="${colors[k] ?? 'var(--accent)'}"><title>${esc(data.keys[k] || '')} — ${esc(r.label)}: ${fmtV(v)}</title></rect>`;
			acc += v;
		});
		if (opts.showTotals && totals[i] > 0)
			g += `<text x="${(x + barW / 2).toFixed(1)}" y="${(yOf(totals[i]) - 7).toFixed(1)}" text-anchor="middle" font-size="11" fill="var(--ink-2)">${fmtV(totals[i])}</text>`;
		const tick = opts.formatTick ? opts.formatTick(r.label, i) : r.label;
		if (tick)
			g += `<text x="${(x + barW / 2).toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="${AXIS}">${esc(tick)}</text>`;
	});
	return frame(g, W, H, opts.ariaLabel ?? opts.title ?? 'Stacked bar chart', opts.title, opts.desc);
}

// ── horizontal ranking bars (genres, top authors) ───────────────────────────────
export interface HBarsOpts {
	width?: number;
	rowH?: number;
	labelW?: number;
	color?: string;
	ariaLabel?: string;
	title?: string;
	desc?: string;
	formatValue?: (n: number) => string;
}

export function hBarsSVG(bars: Bar[], opts: HBarsOpts = {}): string {
	const W = opts.width ?? 1000;
	const rowH = opts.rowH ?? 30;
	const labelW = opts.labelW ?? 250;
	const color = opts.color ?? 'var(--accent)';
	const fmtV = opts.formatValue ?? fmtInt;
	const padT = 6, padB = 6, padR = 16, valueW = 52;
	const H = bars.length * rowH + padT + padB;
	const plotW = W - labelW - valueW - padR;
	const max = bars.reduce((m, b) => Math.max(m, b.value), 0) || 1;
	const bh = rowH * 0.6;

	let g = '';
	bars.forEach((b, i) => {
		const yMid = padT + i * rowH + rowH / 2;
		const len = (b.value / max) * plotW;
		g += `<text x="${labelW - 10}" y="${(yMid + 4).toFixed(1)}" text-anchor="end" font-size="12.5" fill="var(--ink-2)" font-family="var(--sans)">${esc(b.label)}<title>${esc(b.label)}: ${fmtV(b.value)}</title></text>`;
		g += `<rect x="${labelW}" y="${(yMid - bh / 2).toFixed(1)}" width="${Math.max(1, len).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" fill="${color}"/>`;
		g += `<text x="${(labelW + len + 7).toFixed(1)}" y="${(yMid + 4).toFixed(1)}" font-size="12" fill="${AXIS}">${fmtV(b.value)}</text>`;
	});
	return frame(g, W, H, opts.ariaLabel ?? opts.title ?? 'Ranking', opts.title, opts.desc);
}

// ── single 100%-stacked horizontal bar (two-way composition) ─────────────────────
export interface SplitOpts {
	width?: number;
	height?: number;
	ariaLabel?: string;
	title?: string;
	desc?: string;
}

export function splitBarSVG(parts: { label: string; value: number; color: string }[], opts: SplitOpts = {}): string {
	const W = opts.width ?? 1000;
	const H = opts.height ?? 46;
	const total = parts.reduce((a, p) => a + p.value, 0) || 1;
	let x = 0;
	let g = '';
	parts.forEach((p) => {
		const w = (p.value / total) * W;
		const pct = Math.round((p.value / total) * 100);
		g += `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${H}" fill="${p.color}"><title>${esc(p.label)}: ${fmtInt(p.value)} (${pct}%)</title></rect>`;
		if (w > 56)
			g += `<text x="${(x + w / 2).toFixed(1)}" y="${H / 2 + 4.5}" text-anchor="middle" font-size="13" fill="var(--paper)" font-family="var(--sans)">${pct}%</text>`;
		x += w;
	});
	return frame(g, W, H, opts.ariaLabel ?? opts.title ?? 'Split', opts.title, opts.desc);
}
