/* ──────────────────────────────────────────────────────────────────────────
   Homepage scroll-choreographed "peel" engine.

   Ported from the design prototype's componentDidMount(). Runs ONLY when the
   document is in enhanced mode (`<html class="fx-on">`, set by the inline gate
   in HomeExperience.astro when JS + motion are available). With no `.fx-on`,
   this is a no-op and the four screens stay in their accessible stacked flow.

   Drives an internal `target` (scroll intent) eased into `accum`, suppressing
   native scroll except at the very top (scrolling up) and very bottom
   (scrolling down) — the latter hands off to the footer.
   ────────────────────────────────────────────────────────────────────────── */

export function initHomeScroll(): void {
	const html = document.documentElement;
	if (!html.classList.contains('fx-on')) return;

	const $ = (id: string) => document.getElementById(id);
	// Phones (≤700px) get the swipe carousel; tablets (701–1024px) use the desktop
	// peel choreography with a 2×2 quadrant (see home.css tablet override).
	const isMobile = window.matchMedia('(max-width: 700px)').matches;

	const secInd   = $('hx-section-ind');
	const screen02 = $('hx-s02');
	const s02Top   = $('hx-s02-top');
	const s02Bot   = $('hx-s02-bot');
	const screen03 = $('hx-s03');
	const bookRow1 = $('hx-row-1');
	const bookRow2 = $('hx-row-2');
	const bookProg = $('hx-progress');
	const screen01 = $('hx-s01');
	const vcLeft   = $('hx-s01-left');
	const vcRight  = $('hx-s01-right');
	const vcRt     = $('hx-s01-rt');
	const vcRb     = $('hx-s01-rb');
	const screen04 = $('hx-s04');
	const s02Cue   = $('hx-s02-cue');

	let target = 0, accum = 0, rafId: number | null = null;
	let s03Animated = false, s04Animated = false;
	let rowWidths = { r1: 0, r2: 0 };
	let bookPitch = 0, bookPadL = 0; // cover pitch (cover + gap) and row left-padding, measured once
	let carVW = window.innerWidth;

	const MAX_PEEL1 = 620;
	// §04's book sweep is the longest travel in px per scroll unit, so it needs the most scroll
	// distance to feel calm (raise to slow it down, lower to speed it up).
	const MAX_BOOK  = isMobile ? 1400 : 1800;
	const MAX_PEEL2 = 500;
	const N_S03     = Math.min(4, screen03 ? screen03.querySelectorAll('.hx-cell').length : 4) || 4;
	// Desktop gets a dwell so §03 rests fully on screen (readable / clickable) before peel-3.
	const MAX_S03   = isMobile ? 1500 : 240;
	const BOOK_HANDOFF = isMobile ? 0.72 : 0.55;
	const MAX_PEEL3    = 760;
	const PEEL2_START  = MAX_PEEL1 + MAX_BOOK * BOOK_HANDOFF;
	const PEEL2_END    = PEEL2_START + MAX_PEEL2;
	const S03_END      = PEEL2_END + MAX_S03;
	const PEEL3_START  = S03_END;
	const PEEL3_END    = PEEL3_START + MAX_PEEL3;
	const TOTAL        = PEEL3_END;

	// §04's count-up + chart should fire when the stats screen is actually revealed.
	// On desktop that's mid-peel-3 — once the §03 cells have mostly flown off — not at
	// peel-3's very start (where the 1.5s count-up would finish behind the still-covering
	// cells, so you'd land on §04 already counted). Mobile keeps the near-start trigger
	// because §04 there fades in from the beginning of peel-3.
	const S04_TRIGGER = isMobile ? PEEL3_START + 16 : PEEL3_START + MAX_PEEL3 * 0.72;
	const S04_RESET   = isMobile ? PEEL3_START - 12 : PEEL3_START + MAX_PEEL3 * 0.55;

	// ── Mobile cue: one body-level "Scroll/Swipe" hint pinned to the true bottom edge.
	// Visible from screen-01; its label + opacity are driven per-phase in applyAll(). ──
	let mScrollCue: HTMLElement | null = null;
	let mCueLabel: HTMLElement | null = null;
	if (isMobile) {
		mScrollCue = document.createElement('div');
		mScrollCue.id = 'hx-m-scroll-cue';
		mScrollCue.className = 'hx-m-cue';
		mScrollCue.innerHTML = '<span>Scroll</span><div class="hx-drain-track"><div class="hx-drain"></div></div>';
		mCueLabel = mScrollCue.querySelector('span');
		document.body.appendChild(mScrollCue);

		const mCover = document.querySelector<HTMLElement>('.hx-s01__cover');
		if (mCover) {
			const cw = Math.min(Math.round(window.innerWidth * 0.30), 172);
			mCover.style.setProperty('width', cw + 'px', 'important');
			mCover.style.setProperty('height', Math.round(cw * 1.5) + 'px', 'important');
			mCover.style.setProperty('aspect-ratio', 'auto', 'important');
			mCover.style.setProperty('align-self', 'center', 'important');
		}

		carVW = window.innerWidth;
		if (screen03) {
			screen03.style.setProperty('width', N_S03 * carVW + 'px', 'important');
			Array.from(screen03.querySelectorAll<HTMLElement>('.hx-cell')).forEach((c) => {
				c.style.setProperty('flex', '0 0 ' + carVW + 'px', 'important');
				c.style.setProperty('max-width', carVW + 'px', 'important');
				c.style.setProperty('width', carVW + 'px', 'important');
			});
		}
	}

	// Re-init once if the viewport settles and flips the mobile/desktop boundary.
	try {
		const mqM = window.matchMedia('(max-width: 700px)');
		mqM.addEventListener('change', () => {
			if (!sessionStorage.getItem('__hx_reinit')) {
				sessionStorage.setItem('__hx_reinit', '1');
				location.reload();
			}
		});
	} catch { /* noop */ }

	const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

	// ── Screen 04 count-up + chart ──
	const triggerS04 = () => {
		document.querySelectorAll<HTMLElement>('#hx-s04-stats [data-count]').forEach((el) => {
			const tgt = parseFloat(el.dataset.count || '0');
			const dec = el.dataset.dec === '1';
			const suffix = el.dataset.suffix || '';
			const dur = 1500, st = performance.now();
			const step = (now: number) => {
				const p = Math.min(1, (now - st) / dur);
				const e = 1 - Math.pow(1 - p, 3);
				const v = tgt * e;
				el.textContent = (dec ? v.toFixed(1) : Math.round(v).toString()) + suffix;
				if (p < 1) requestAnimationFrame(step);
			};
			requestAnimationFrame(step);
		});
		document.querySelectorAll<HTMLElement>('#hx-s04-chart .hx-bar').forEach((b, i) => {
			b.style.transitionDelay = i * 45 + 'ms';
			b.style.height = b.dataset.h + '%';
		});
		document.querySelectorAll<HTMLElement>('#hx-s04-chart .hx-col__val').forEach((v, i) => {
			v.style.transitionDelay = i * 45 + 280 + 'ms';
			v.style.opacity = '1';
		});
	};
	const resetS04 = () => {
		document.querySelectorAll<HTMLElement>('#hx-s04-stats [data-count]').forEach((el) => { el.textContent = '0'; });
		document.querySelectorAll<HTMLElement>('#hx-s04-chart .hx-bar').forEach((b) => { b.style.transitionDelay = '0ms'; b.style.height = '0'; });
		document.querySelectorAll<HTMLElement>('#hx-s04-chart .hx-col__val').forEach((v) => { v.style.transitionDelay = '0ms'; v.style.opacity = '0'; });
	};

	const applyAll = (a: number) => {
		// ── Peel 1 ──
		const p1 = Math.max(0, Math.min(1, a / MAX_PEEL1));
		const e1 = ease(p1);
		if (isMobile) {
			// Mobile layout = top cell + a bottom strip (cell-02 left, cell-03 right). Split each
			// toward its NEAREST edge so they clear cleanly: top ↑, bottom-left ↙, bottom-right ↘.
			if (screen01) screen01.style.transform = '';
			if (vcLeft) vcLeft.style.transform = e1 > 0.001 ? `translateY(${-e1 * 118}%) rotate(${-e1 * 2}deg)` : '';
			const e1m = ease(Math.min(1, p1 * 1.15));
			if (vcRt) vcRt.style.transform = e1m > 0.001 ? `translateX(${-e1m * 120}%) translateY(${e1m * 24}%) rotate(${-e1m * 5}deg)` : '';
			if (vcRb) vcRb.style.transform = e1m > 0.001 ? `translateX(${e1m * 120}%) translateY(${e1m * 24}%) rotate(${e1m * 5}deg)` : '';
			// Zero the strip divider + inter-cell seam during the peel so no line lingers.
			if (vcRight) { if (e1 > 0.001) vcRight.style.borderTopWidth = '0'; else vcRight.style.removeProperty('border-top-width'); }
			if (vcRt) { if (e1 > 0.001) vcRt.style.borderRightWidth = '0'; else vcRt.style.removeProperty('border-right-width'); }
		} else {
			if (vcLeft) vcLeft.style.transform = e1 > 0.001 ? `translateX(${-e1 * 115}%) rotate(${-e1 * 6}deg)` : '';

			const e1rt = ease(Math.min(1, p1 * 1.3));
			if (vcRt) vcRt.style.transform = e1rt > 0.001 ? `translateX(${e1rt * 125}%) translateY(${-e1rt * 115}%) rotate(${e1rt * 5}deg)` : '';

			const e1rb = ease(Math.min(1, p1 * 0.88));
			if (vcRb) vcRb.style.transform = e1rb > 0.001 ? `translateX(${e1rb * 115}%) translateY(${e1rb * 90}%) rotate(${-e1rb * 3.5}deg)` : '';

			// Hide seam borders during the peel so they don't linger over screen-02.
			if (vcRight) {
				if (e1 > 0.001) vcRight.style.borderLeftWidth = '0';
				else vcRight.style.removeProperty('border-left-width');
			}
			if (vcRt) {
				if (e1 > 0.001) vcRt.style.borderBottomWidth = '0';
				else vcRt.style.removeProperty('border-bottom-width');
			}
		}

		// Once peel-1 is complete, drop screen-01 from the flow (safety net for both modes).
		if (screen01) screen01.style.display = a > MAX_PEEL1 ? 'none' : '';

		// ── Screen 02 fades in behind, then is dropped once peel-2 is done ──
		// (Its transparent container otherwise lingers over screen-03/04 and eats clicks.)
		const s2alpha = Math.max(0, Math.min(1, (e1 - 0.05) / 0.95));
		if (screen02) {
			if (s2alpha > 0.01 && a <= PEEL2_END + 2) { screen02.style.display = 'flex'; screen02.style.opacity = String(s2alpha); }
			else screen02.style.display = 'none';
		}

		// ── Book sweep (counter-scroll) ──
		const bookP = Math.max(0, Math.min(1, (a - MAX_PEEL1) / MAX_BOOK));
		const bookTrans = Math.min(bookP, BOOK_HANDOFF);
		const vw = window.innerWidth;
		if (!rowWidths.r1 && bookRow1 && bookRow1.offsetWidth > 10) rowWidths.r1 = bookRow1.offsetWidth;
		if (!rowWidths.r2 && bookRow2 && bookRow2.offsetWidth > 10) rowWidths.r2 = bookRow2.offsetWidth;
		const r1W = rowWidths.r1 || vw * 1.9;
		const r2W = rowWidths.r2 || vw * 1.9;
		const swp = Math.max(r1W, r2W) + vw;

		// Measure the cover pitch + row padding once so we can land the rest frame on
		// whole covers (no sliced "last book" before peel-2).
		if (!bookPitch && bookRow1) {
			const bks = bookRow1.querySelectorAll<HTMLElement>('.hx-book');
			if (bks.length >= 2) { bookPitch = bks[1].offsetLeft - bks[0].offsetLeft; bookPadL = bks[0].offsetLeft; }
		}
		// As the sweep settles into its rest point (the last ~12% before the handoff),
		// nudge each row so a cover boundary lands exactly at the right viewport edge —
		// the rightmost cover stays whole instead of being clipped. Blended in so the
		// motion doesn't jump, and fully released when scrolling back up.
		const snapRight = (x: number) =>
			bookPitch > 0 ? vw - bookPadL - Math.round((vw - (x + bookPadL)) / bookPitch) * bookPitch : x;
		const snapW = bookPitch > 0 ? Math.max(0, Math.min(1, (bookTrans - (BOOK_HANDOFF - 0.12)) / 0.12)) : 0;
		let x1 = -r1W + bookTrans * swp;
		let x2 = vw - bookTrans * swp;
		if (snapW > 0) { x1 += (snapRight(x1) - x1) * snapW; x2 += (snapRight(x2) - x2) * snapW; }
		if (bookRow1) bookRow1.style.transform = `translateX(${x1.toFixed(1)}px)`;
		if (bookRow2) bookRow2.style.transform = `translateX(${x2.toFixed(1)}px)`;
		// Progress fills across the book sweep and reaches 100% right at the handoff,
		// before peel-2 flies the bar off — so it visibly completes to the edge.
		const secProg = Math.max(0, Math.min(1, bookTrans / BOOK_HANDOFF));
		if (bookProg) bookProg.style.width = `${secProg * 100}%`;

		// Recompute row widths if the user scrolls back before the sweep (layout may shift).
		if (p1 < 0.5) rowWidths = { r1: 0, r2: 0 };

		// ── Screen 03 entrance ──
		const s03On = a > PEEL2_START;
		if (screen03) screen03.style.display = s03On ? (isMobile ? 'flex' : 'grid') : 'none';

		if (s03On && !s03Animated) {
			s03Animated = true;
			if (isMobile) {
				screen03!.style.animation = 'none';
				screen03!.style.opacity = '0';
				void screen03!.offsetHeight;
				screen03!.style.opacity = '';
				screen03!.style.animation = 'hxFadeOnly 0.6s cubic-bezier(0.22,1,0.36,1) both';
			} else {
				const cells = Array.from(screen03!.querySelectorAll<HTMLElement>('.hx-cell'));
				cells.forEach((c) => { c.style.animation = 'none'; c.style.opacity = '0'; c.style.transform = 'translateY(18px)'; });
				void screen03!.offsetHeight;
				cells.forEach((c, i) => { c.style.opacity = ''; c.style.transform = ''; c.style.animation = `hxFadeUp 0.78s cubic-bezier(0.22,1,0.36,1) ${i * 85}ms both`; });
				screen03!.querySelectorAll<HTMLElement>('.cover').forEach((b, i) => { b.style.animation = `hxFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) ${180 + i * 28}ms both`; });
			}
		}
		if (!s03On && s03Animated) {
			s03Animated = false;
			if (isMobile) {
				screen03!.style.animation = ''; screen03!.style.opacity = '';
			} else {
				screen03?.querySelectorAll<HTMLElement>('.hx-cell').forEach((c) => { c.style.animation = ''; c.style.opacity = '0'; c.style.transform = ''; });
				screen03?.querySelectorAll<HTMLElement>('.cover').forEach((b) => { b.style.animation = ''; });
			}
		}

		// ── Mobile carousel sweep ──
		if (isMobile && screen03) {
			if (screen02 && a > PEEL2_END + 2) screen02.style.display = 'none';
			if (window.innerWidth && window.innerWidth !== carVW) {
				carVW = window.innerWidth;
				screen03.style.setProperty('width', N_S03 * carVW + 'px', 'important');
				Array.from(screen03.querySelectorAll<HTMLElement>('.hx-cell')).forEach((c) => {
					c.style.setProperty('flex', '0 0 ' + carVW + 'px', 'important');
					c.style.setProperty('max-width', carVW + 'px', 'important');
					c.style.setProperty('width', carVW + 'px', 'important');
				});
			}
			const carP = Math.max(0, Math.min(1, (a - PEEL2_END) / MAX_S03));
			screen03.style.transform = `translateX(-${(carP * (N_S03 - 1) * carVW).toFixed(1)}px)`;
		}

		// ── Peel 2: screen-02 splits open ──
		const p2 = Math.max(0, Math.min(1, (a - PEEL2_START) / MAX_PEEL2));
		const e2 = ease(p2);
		if (s02Top) s02Top.style.transform = e2 > 0.001 ? `translateY(${-e2 * 110}%)` : '';
		if (s02Bot) s02Bot.style.transform = e2 > 0.001 ? `translateY(${e2 * 110}%)` : '';

		// ── Peel 3: screen-03 flies out, stats fly in ──
		const p3 = Math.max(0, Math.min(1, (a - PEEL3_START) / MAX_PEEL3));
		const e3 = ease(p3);
		const em3 = isMobile ? ease(Math.min(1, p3 / 0.62)) : e3;
		if (screen04) {
			screen04.style.display = a > PEEL3_START - 80 ? 'flex' : 'none';
			screen04.style.opacity = isMobile ? String(Math.min(1, em3 * 1.6)) : '1';
			screen04.style.transform = isMobile ? `translateY(${((1 - em3) * 40).toFixed(1)}px)` : '';
		}
		if (a > S04_TRIGGER && !s04Animated) { s04Animated = true; triggerS04(); }
		if (a < S04_RESET && s04Animated) { s04Animated = false; resetS04(); }
		if (screen03) {
			if (p3 > 0.001) {
				screen03.style.background = 'transparent';
				if (isMobile) {
					const lastX = (N_S03 - 1) * carVW;
					screen03.style.transform = `translateX(-${lastX.toFixed(1)}px) translateY(${(-em3 * 108).toFixed(1)}%) rotate(${(-em3 * 1.5).toFixed(2)}deg)`;
					screen03.style.opacity = String(Math.max(0, 1 - em3 * 1.5));
					screen03.style.display = em3 > 0.97 ? 'none' : 'flex';
				} else {
					const fly: [string, string][] = [
						['hx-cell-0', `translateX(${-e3 * 135}%) rotate(${-e3 * 5}deg)`],
						['hx-cell-1', `translate(${e3 * 45}%, ${-e3 * 130}%) rotate(${e3 * 4}deg)`],
						['hx-cell-2', `translateY(${e3 * 135}%) rotate(${-e3 * 3}deg)`],
						['hx-cell-3', `translate(${e3 * 135}%, ${e3 * 75}%) rotate(${e3 * 5}deg)`],
					];
					fly.forEach(([id, t]) => { const el = $(id); if (el) { el.style.animation = 'none'; el.style.transform = t; } });
				}
			} else {
				screen03.style.background = '';
				if (isMobile) screen03.style.opacity = '';
				// Restore cells to visible — peel-3 set animation:none, so without this they'd
				// fall back to the CSS `opacity:0` default (a blank/ink screen on the way back).
				else ['hx-cell-0', 'hx-cell-1', 'hx-cell-2', 'hx-cell-3'].forEach((id) => { const el = $(id); if (el) { el.style.transform = ''; el.style.animation = ''; el.style.opacity = '1'; } });
			}
		}

		// ── §04 scroll cue (centre seam): in once §04 has settled, out as the screen splits open ──
		if (s02Cue) {
			const cueOn = a >= SWEEP_START - 2 && a < PEEL2_START + 30;
			s02Cue.style.opacity = cueOn ? '1' : '0';
		}

		// ── Section indicator ──
		if (secInd) {
			if (p1 < 0.6) secInd.textContent = '01 — Latest Review';
			else if (p2 < 0.6) secInd.textContent = '04 — Recently Reviewed';
			else secInd.textContent = '05–08 — Featured';
		}

		// ── Mobile bottom-edge cue: "Scroll" while advancing the vertical peels,
		// "Swipe" across the §03 carousel; fades out mid-transition and at the end. ──
		if (mScrollCue) {
			const inCarousel = a > PEEL2_END && a < S03_END;
			if (mCueLabel) mCueLabel.textContent = inCarousel ? 'Swipe' : 'Scroll';
			let vis = 1;
			if (a > MAX_PEEL1 * 0.35 && a <= PEEL2_END) vis = 0;          // through the book sweep
			else if (inCarousel) {
				const carP = Math.max(0, Math.min(1, (a - PEEL2_END) / MAX_S03));
				vis = carP > 0.92 ? 0 : 1;                               // fade as the carousel ends
			} else if (a >= S03_END) vis = 0;                            // peel-3 / stats
			mScrollCue.classList.toggle('hx-m-cue--s01', a <= MAX_PEEL1 * 0.35);
			mScrollCue.style.opacity = String(vis);
		}
	};

	// A timed tween drives the stop-to-stop transitions (see "Page-style" below); the exponential
	// follow below is kept as the generic fallback.
	let ease_k = 0.11;
	let tw: { from: number; to: number; t0: number; dur: number } | null = null;
	const easeIO = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
	const smooth = () => {
		if (tw) {
			const p = Math.min(1, (performance.now() - tw.t0) / tw.dur);
			accum = tw.from + (tw.to - tw.from) * easeIO(p);
			if (p >= 1) { accum = tw.to; tw = null; }
			applyAll(accum);
			rafId = tw ? requestAnimationFrame(smooth) : null;
			return;
		}
		accum += (target - accum) * ease_k;
		if (Math.abs(target - accum) <= 0.5) accum = target; // land exactly so rest frames don't leave a hidden screen half-shown
		applyAll(accum);
		rafId = Math.abs(target - accum) > 0.5 ? requestAnimationFrame(smooth) : null;
	};
	const start = () => { if (!rafId) rafId = requestAnimationFrame(smooth); };

	// Only hijack while the experience is pinned in view. Once the user scrolls past it
	// (to the footer), `scrollY > 2` and we let native scroll run freely — re-engaging
	// when they scroll back to the top. Resolves the end-of-experience / footer conflict.
	const pinned = () => window.scrollY <= 2;

	// ── Page-style stepping (with a scrubbed §04) ──
	// STOPS are the screens that rest on their own: §01, §04 just revealed (SWEEP_START), §04 with the
	// covers landed (PEEL2_START), §03 settled (on phones each carousel card is its own stop), and the
	// stats screen. One deliberate swipe (or key) triggers one complete, timed transition to the next
	// stop. The exception is the §04 book sweep between SWEEP_START and PEEL2_START: that follows your
	// scroll gradually, bounded at both ends so a swipe can't spill into the next screen.
	// Input is ignored until a transition ends AND the wheel (inertia included) has gone quiet.
	const SWEEP_START = MAX_PEEL1 + 60;
	const STOPS: number[] = [0, SWEEP_START, PEEL2_START];
	if (isMobile && N_S03 > 1) for (let k = 0; k < N_S03; k++) STOPS.push(PEEL2_END + (k * MAX_S03) / (N_S03 - 1));
	else STOPS.push(PEEL2_END);
	STOPS.push(TOTAL);
	const WHEEL_TRIGGER = 90;    // accumulated wheel units (after gain) that count as an intentional swipe
	const TOUCH_TRIGGER = 28;    // finger travel in px that counts as an intentional swipe
	const WHEEL_QUIET_MS = 120;  // a pause this long between wheel events starts a new gesture
	const SWEEP_OVERFLOW = 150;  // pushing this much further past either end of the §04 sweep steps on to the next screen
	const TWEEN_BASE_MS = 280, TWEEN_PER_UNIT = 1.0; // duration = base + distance × per-unit (longer hops get more time)
	const stopBelow = (t: number) => [...STOPS].reverse().find((v) => v < t - 1) ?? 0;
	const stopAbove = (t: number) => STOPS.find((v) => v > t + 1) ?? TOTAL;
	const inSweepRange = (t: number) => t >= SWEEP_START - 1 && t <= PEEL2_START + 1;
	// A direction scrubs (rather than steps) when it moves along the §04 sweep without leaving it.
	const scrubs = (t: number, dir: number) =>
		inSweepRange(t) && ((dir > 0 && t < PEEL2_START - 1) || (dir < 0 && t > SWEEP_START + 1));
	const goTo = (to: number) => {
		if (Math.abs(to - target) < 1 && !tw) return;
		const from = accum;
		tw = { from, to, t0: performance.now(), dur: TWEEN_BASE_MS + Math.abs(to - from) * TWEEN_PER_UNIT };
		target = to;
		if (!rafId) rafId = requestAnimationFrame(smooth);
	};
	// Step to the next stop in a direction. Mid-transition a second swipe in the same direction skips
	// ahead to the stop after the current destination; the opposite direction turns back from where we are.
	const step = (dir: number) => {
		const ref = tw && dir !== Math.sign(tw.to - tw.from) ? accum : target;
		goTo(dir > 0 ? stopAbove(ref) : stopBelow(ref));
	};
	// Follow the finger/wheel along the sweep, clamped to its ends. Returns how much input (in raw
	// units) was pushed past an end, so a hard push can carry on to the next screen.
	const SWEEP_GAIN = 0.85; // the sweep covers a lot of ground per scroll unit, so scale input down to keep it gradual
	const scrub = (d: number, gain = SWEEP_GAIN): number => {
		ease_k = 0.11;
		const want = target + d * gain;
		const t = Math.max(SWEEP_START, Math.min(PEEL2_START, want));
		if (t !== target) { target = t; if (!rafId) rafId = requestAnimationFrame(smooth); }
		return Math.abs(want - t) / gain;
	};

	// ── Wheel (desktop) ──
	// Trackpads send a two-finger sideways swipe as wheel events with deltaX (not touch events),
	// so read the dominant axis: right-to-left (+deltaX) or down (+deltaY) advances, the reverse goes back.
	// Inertia after a swipe is told apart from a NEW swipe by a pause, a change of direction, or the
	// deltas jumping back up after they had decayed.
	const WHEEL_MULT = 1.4;
	const WHEEL_MULT_X = 0.9; // trackpad sideways swipes report deltas as large as vertical ones, so keep the gain a touch under WHEEL_MULT
	const WHEEL_CLAMP = 100;
	let lastWheel = 0, wAcc = 0, wDone = false, wScrub = false, wOver = 0, wPrevAbs = 0, wLowAbs = Infinity, wDir = 0;
	document.addEventListener('wheel', (e) => {
		if (!pinned()) return;
		const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
		const raw = horiz ? e.deltaX : e.deltaY;
		const now = performance.now();
		const abs = Math.abs(raw), dir = Math.sign(raw);
		const reaccel = abs >= 12 && wLowAbs < Infinity && abs > wLowAbs * 2 + 8;        // deltas climbed back up after decaying
		const newGesture = now - lastWheel > WHEEL_QUIET_MS || (dir !== 0 && wDir !== 0 && dir !== wDir && abs >= 8) || reaccel;
		lastWheel = now;
		if (newGesture) { wAcc = 0; wDone = false; wScrub = false; wOver = 0; wLowAbs = Infinity; }
		if (abs < 4) { e.preventDefault(); return; }                                       // sensor noise / tail
		if (abs < wPrevAbs) wLowAbs = Math.min(wLowAbs, abs); else if (newGesture) wLowAbs = Infinity;
		wPrevAbs = abs; wDir = dir;
		const d = Math.max(-WHEEL_CLAMP, Math.min(WHEEL_CLAMP, raw)) * (horiz ? WHEEL_MULT_X : WHEEL_MULT);
		if (target <= 0 && d < 0 && !tw) { if (horiz) e.preventDefault(); return; }        // release upward at the top (swallow sideways so the browser doesn't navigate back)
		if (target >= TOTAL && d > 0 && !tw) return;                                       // release downward → footer
		e.preventDefault();
		if (wDone) return;                                                                 // already stepped in this gesture
		if (wScrub && !tw) {                                                               // this gesture is scrubbing the sweep
			wOver += scrub(d);
			if (wOver >= SWEEP_OVERFLOW) { wDone = true; step(d > 0 ? 1 : -1); }       // pushed hard past the end: carry on
			return;
		}
		wAcc += d;
		if (!tw && scrubs(target, d > 0 ? 1 : -1)) { wScrub = true; wOver = scrub(wAcc); wAcc = 0; return; }
		if (Math.abs(wAcc) >= WHEEL_TRIGGER) { wDone = true; step(wAcc > 0 ? 1 : -1); }
	}, { passive: false });

	// ── Touch (tablet + mobile) ──
	// Both axes work: swipe up OR right-to-left advances, swipe down OR left-to-right goes back.
	// The dominant axis is locked once the finger has moved a few px.
	const TOUCH_MULT = 1.35;
	let touchLastD = 0, touchOver = 0, touchStartX = 0, touchStartY = 0, touchAxis: 'x' | 'y' | null = null, touchDone = false, touchScrub = false;
	document.addEventListener('touchstart', (e) => {
		touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY;
		touchAxis = null; touchDone = false; touchScrub = false; touchLastD = 0; touchOver = 0;
	}, { passive: true });
	document.addEventListener('touchmove', (e) => {
		if (!pinned()) return;
		const dx = touchStartX - e.touches[0].clientX, dy = touchStartY - e.touches[0].clientY;
		if (!touchAxis) {
			if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
			touchAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
		}
		const d = touchAxis === 'x' ? dx : dy; // right-to-left / up = forward
		const inc = d - touchLastD; touchLastD = d;
		if (!tw && ((target <= 0 && d < 0) || (target >= TOTAL && d > 0))) return; // release at edges
		e.preventDefault();
		if (touchDone) return;
		if (touchScrub && !tw) {
			touchOver += scrub(inc * TOUCH_MULT);
			if (touchOver >= SWEEP_OVERFLOW) { touchDone = true; step(d > 0 ? 1 : -1); }
			return;
		}
		if (!tw && scrubs(target, d > 0 ? 1 : -1)) { touchScrub = true; touchOver = scrub(d * TOUCH_MULT); return; }
		if (Math.abs(d) >= TOUCH_TRIGGER) { touchDone = true; step(d > 0 ? 1 : -1); }
	}, { passive: false });

	// ── Keyboard ──
	// Page/arrow keys jump straight to the next (or previous) resting point; along the §04 sweep they
	// move it in smaller increments instead.
	const KEY_SWEEP_STEP = 330;
	document.addEventListener('keydown', (e) => {
		if (!pinned()) return;
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
		const fwd = e.key === 'PageDown' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowRight';
		const back = e.key === 'PageUp' || e.key === 'ArrowUp' || e.key === 'ArrowLeft';
		const home = e.key === 'Home', end = e.key === 'End';
		if (!fwd && !back && !home && !end) return;
		if (!tw && ((fwd && target >= TOTAL) || (back && target <= 0) || (end && target >= TOTAL) || (home && target <= 0))) return; // at an edge → browser default (footer)
		e.preventDefault();
		if (home) goTo(0);
		else if (end) goTo(TOTAL);
		else if (!tw && scrubs(target, fwd ? 1 : -1)) scrub(fwd ? KEY_SWEEP_STEP : -KEY_SWEEP_STEP, 1);
		else step(fwd ? 1 : -1);
	});

	// SSR renders §04's stats at their final values; zero them up front so they don't
	// flash through the flying §03 cells before the count-up fires (S04_TRIGGER) on reveal.
	resetS04();
	applyAll(0);
}
