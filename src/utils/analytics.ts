// Thin wrapper around GA4 (gtag). GA is only loaded in production builds (see
// BaseHead.astro), so every function here no-ops gracefully when gtag is absent —
// safe to call unconditionally from any client script, including in `npm run dev`.

type Params = Record<string, unknown>;

/** Fire a GA4 event. No-ops when GA isn't loaded (e.g. dev), so it's always safe to call. */
export function track(name: string, params: Params = {}): void {
	if (typeof window === 'undefined') return;
	const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
	if (typeof g !== 'function') return;
	g('event', name, params);
}

/**
 * Delegated outbound-link tracking. Call once, globally (from BaseHead). Fires an
 * `outbound_click` event for any click on a link to a different host.
 */
export function initOutboundTracking(): void {
	if (typeof document === 'undefined') return;
	document.addEventListener('click', (e) => {
		const a = (e.target as HTMLElement)?.closest?.('a');
		const href = a?.getAttribute('href') ?? '';
		if (!/^https?:\/\//i.test(href)) return;
		try {
			const url = new URL(href, location.href);
			if (url.host === location.host) return; // internal link
			track('outbound_click', {
				link_url: href,
				link_domain: url.host,
				link_text: a!.textContent?.trim().slice(0, 100),
			});
		} catch {
			/* malformed href — ignore */
		}
	}, { capture: true });
}

/**
 * Delegated internal content-click tracking. Call once, globally (from BaseHead).
 * Fires a `select_content` event when an internal link to a content page is clicked,
 * capturing which item was opened and the page the click came from. This is the click
 * *intent* on top of the automatic `page_view` that fires when the destination loads.
 *
 * Search-result rows are <div>s (not <a>) and are already covered by `select_search_result`,
 * so they don't double-count here.
 */
export function initContentClickTracking(): void {
	if (typeof document === 'undefined') return;
	document.addEventListener('click', (e) => {
		const a = (e.target as HTMLElement)?.closest?.('a');
		const href = a?.getAttribute('href') ?? '';
		if (!href.startsWith('/')) return; // internal, root-relative links only
		let content_type = '';
		if (href.startsWith('/blog/')) content_type = 'post';        // reviews + lists
		else if (href.startsWith('/authors/')) content_type = 'author';
		else if (href.startsWith('/tags/')) content_type = 'tag';
		else return;                                                  // not a content link we track
		track('select_content', {
			content_type,
			item_id: href,
			link_text: a!.textContent?.trim().slice(0, 100),
			source_path: location.pathname,
		});
	}, { capture: true });
}
