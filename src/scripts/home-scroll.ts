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

	let target = 0, accum = 0, rafId: number | null = null;
	let s03Animated = false, s04Animated = false;
	let rowWidths = { r1: 0, r2: 0 };
	let bookPitch = 0, bookPadL = 0; // cover pitch (cover + gap) and row left-padding, measured once
	let carVW = window.innerWidth;

	const MAX_PEEL1 = 620;
	const MAX_BOOK  = isMobile ? 1100 : 1400;
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

	// ── Mobile carousel SCROLL cue (shown only during the §03 carousel) ──
	let mScrollCue: HTMLElement | null = null;
	if (isMobile) {
		mScrollCue = document.createElement('div');
		mScrollCue.id = 'hx-m-scroll-cue';
		mScrollCue.style.cssText = 'position:fixed;bottom:calc(var(--exp-foot,34px) + 14px);left:50%;transform:translateX(-50%);display:none;flex-direction:column;align-items:center;gap:5px;pointer-events:none;z-index:190;transition:opacity 400ms;';
		mScrollCue.innerHTML = '<span style="font-family:var(--mono);font-size:9px;letter-spacing:.3em;text-transform:uppercase;color:rgba(120,96,72,.7);">Swipe</span><div style="width:1px;height:20px;overflow:hidden;"><div style="width:100%;height:100%;background:rgba(120,96,72,.55);animation:hxScrollDrain 2.2s ease-in-out infinite;"></div></div>';
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
				if (mScrollCue) mScrollCue.style.display = 'flex';
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
				if (mScrollCue) mScrollCue.style.display = 'none';
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
			if (mScrollCue) mScrollCue.style.opacity = carP > 0.92 ? '0' : '1';
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

		// ── Section indicator ──
		if (secInd) {
			if (p1 < 0.6) secInd.textContent = '01 — Latest Review';
			else if (p2 < 0.6) secInd.textContent = '04 — Recently Reviewed';
			else secInd.textContent = '05–08 — Featured';
		}
	};

	const smooth = () => {
		accum += (target - accum) * 0.11;
		applyAll(accum);
		rafId = Math.abs(target - accum) > 0.5 ? requestAnimationFrame(smooth) : null;
	};
	const start = () => { if (!rafId) rafId = requestAnimationFrame(smooth); };

	// Only hijack while the experience is pinned in view. Once the user scrolls past it
	// (to the footer), `scrollY > 2` and we let native scroll run freely — re-engaging
	// when they scroll back to the top. Resolves the end-of-experience / footer conflict.
	const pinned = () => window.scrollY <= 2;

	// ── Wheel (desktop) ──
	// Gear up the wheel so the full experience is a couple of swipes, not 3–4. (Touch
	// already multiplies its delta below.) The 0.11 ease in smooth() keeps it from feeling
	// jumpy. Raise toward ~2.4 for fewer swipes, lower toward 1 for more deliberate scroll.
	const WHEEL_MULT = 1.9;
	document.addEventListener('wheel', (e) => {
		if (!pinned()) return;
		const newT = Math.max(0, Math.min(TOTAL, target + e.deltaY * WHEEL_MULT));
		if (newT === 0 && e.deltaY < 0) return;        // release upward at the top
		if (newT >= TOTAL && e.deltaY > 0) return;     // release downward → footer
		e.preventDefault();
		target = newT;
		start();
	}, { passive: false });

	// ── Touch (tablet + mobile) ──
	let touchLastY = 0;
	document.addEventListener('touchstart', (e) => { touchLastY = e.touches[0].clientY; }, { passive: true });
	document.addEventListener('touchmove', (e) => {
		if (!pinned()) return;
		const dy = touchLastY - e.touches[0].clientY;
		touchLastY = e.touches[0].clientY;
		const newT = Math.max(0, Math.min(TOTAL, target + dy * 1.8));
		if ((target <= 0 && dy < 0) || (target >= TOTAL && dy > 0)) return; // release at edges
		e.preventDefault();
		if (newT !== target) { target = newT; start(); }
	}, { passive: false });

	// ── Keyboard ──
	const STEP = 420;
	document.addEventListener('keydown', (e) => {
		if (!pinned()) return;
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
		let nt = target;
		if (e.key === 'PageDown' || e.key === ' ' || e.key === 'ArrowDown') nt = target + STEP;
		else if (e.key === 'PageUp' || e.key === 'ArrowUp') nt = target - STEP;
		else if (e.key === 'Home') nt = 0;
		else if (e.key === 'End') nt = TOTAL;
		else return;
		nt = Math.max(0, Math.min(TOTAL, nt));
		if (nt === target) return; // at an edge → let the browser handle it (e.g. reach footer)
		e.preventDefault();
		target = nt;
		start();
	});

	// SSR renders §04's stats at their final values; zero them up front so they don't
	// flash through the flying §03 cells before the count-up fires (S04_TRIGGER) on reveal.
	resetS04();
	applyAll(0);
}
