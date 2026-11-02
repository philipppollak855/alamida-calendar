export function RouteFlow({ von, nach }: { von: string; nach: string }) {
  return (
    <div className="route-flow" aria-label={`${von} nach ${nach}`}>
      <span className="route-from">{von}</span>
      <span className="route-arrow" aria-hidden>
        <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
          <path
            d="M0 6h14m0 0l-4-4m4 4l-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="route-to">{nach}</span>
    </div>
  );
}
