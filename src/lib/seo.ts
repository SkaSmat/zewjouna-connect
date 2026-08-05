/**
 * Per-route <head> metadata helper.
 * Each content route gets a unique title + description (SEO + link previews).
 */
export function pageHead(title: string, description: string) {
  return () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  });
}
