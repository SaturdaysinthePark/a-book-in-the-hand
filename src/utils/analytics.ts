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
