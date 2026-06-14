// stats-charts.ts — the single source of truth for rendering each /stats chart from
// a serialisable spec. The page renders every spec server-side at a default width
// (first paint / no-JS), then a client script re-renders each chart at its real
// container pixel width (so SVG text is crisp ~1:1 at any screen size) and applies
// mobile trims. Both paths call renderSpec(), so there's one rendering code path.

import { barsSVG, hBarsSVG, curveSVG, splitBarSVG, type Bar } from './charts';
import { tickFn, valueFn, thinTicks, truncate, type TickKind, type ValueKind } from './chart-format';

export type ChartKind = 'bars' | 'curve' | 'hbars' | 'split';

export interface SplitPart { label: string; value: number; color: string }

export interface ChartSpec {
	id: string; // matches the holder element id
	kind: ChartKind;
	data: Bar[] | SplitPart[];
	color?: string;
	colors?: string[]; // hbars: optional per-bar fill, index-aligned to data
	tick?: TickKind;
	value?: ValueKind;
	yTicks?: number;
	showValues?: boolean;
	labelWRatio?: number; // hbars: label column as a fraction of width
	rowH?: number; // hbars
	ariaLabel: string;
	title?: string;
	desc?: string;
	// Applied only when the viewport is mobile:
	mobile?: { maxRows?: number; thin?: number; hideValues?: boolean };
}

/** Vertical charts: a comfortable height for the given width (taller, relatively, on mobile). */
export const barsHeight = (width: number, isMobile: boolean): number =>
	Math.max(240, Math.min(460, Math.round(width * (isMobile ? 0.62 : 0.46))));

/**
 * Render one chart spec to an SVG string at `width` px. When `isMobile`, dense
 * charts trim rows, thin their x-labels, and may drop value labels.
 */
export function renderSpec(spec: ChartSpec, width: number, isMobile: boolean): string {
	const value = valueFn(spec.value);
	const common = { ariaLabel: spec.ariaLabel, title: spec.title, desc: spec.desc };

	if (spec.kind === 'bars' || spec.kind === 'curve') {
		let tick = tickFn(spec.tick);
		if (isMobile && spec.mobile?.thin) tick = thinTicks(tick, spec.mobile.thin);
		const showValues = isMobile && spec.mobile?.hideValues ? false : (spec.showValues ?? false);
		const fn = spec.kind === 'curve' ? curveSVG : barsSVG;
		return fn(spec.data as Bar[], {
			width, height: barsHeight(width, isMobile), color: spec.color,
			showValues, yTicks: spec.yTicks, formatTick: tick, formatValue: value, ...common,
		});
	}

	if (spec.kind === 'hbars') {
		let data = spec.data as Bar[];
		if (isMobile && spec.mobile?.maxRows) data = data.slice(0, spec.mobile.maxRows);
		const labelW = Math.round(width * (spec.labelWRatio ?? 0.3));
		const budget = Math.max(6, Math.floor((labelW - 12) / 7.4)); // ~chars that fit the label column
		data = data.map((d) => ({ ...d, label: truncate(d.label, budget) }));
		return hBarsSVG(data, { width, rowH: spec.rowH ?? 30, labelW, color: spec.color, colors: spec.colors, formatValue: value, ...common });
	}

	// split
	return splitBarSVG(spec.data as SplitPart[], { width, ...common });
}
