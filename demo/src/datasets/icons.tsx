const props = {
  viewBox: '0 0 20 20',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};
export const SignalIcon = () => (
  <svg {...props}>
    <path d="M2 11h3l2-6 3 10 2.5-7 1.5 3H18" />
  </svg>
);
export const GenomeIcon = () => (
  <svg {...props}>
    <path d="M6 2c0 5 8 5 8 8s-8 3-8 8M14 2c0 5-8 5-8 8s8 3 8 8" />
    <path d="M7.5 5h5M7.5 15h5" strokeWidth="1.2" />
  </svg>
);
export const MarketIcon = () => (
  <svg {...props}>
    <path d="M5 4v12M10 3v14M15 6v9" strokeWidth="1.1" />
    <rect x="3.5" y="7" width="3" height="5" rx=".6" />
    <rect x="8.5" y="5" width="3" height="7" rx=".6" />
    <rect x="13.5" y="8" width="3" height="4" rx=".6" />
  </svg>
);
export const BitcoinIcon = () => (
  <svg {...props}>
    <circle cx="10" cy="10" r="7.5" />
    <path
      d="M8 6v8M8 6h3a2 2 0 0 1 0 4H8m0 0h3.5a2 2 0 0 1 0 4H8M9 4.8V6m0 8v1.2"
      strokeWidth="1.2"
    />
  </svg>
);
export const LogsIcon = () => (
  <svg {...props}>
    <rect x="2.5" y="3" width="15" height="14" rx="2" />
    <path d="m6 8 2 2-2 2M10 12h4" />
  </svg>
);
export const StarsIcon = () => (
  <svg {...props}>
    <path d="M8 2.5 9.4 7 14 8.5 9.4 10 8 14.5 6.6 10 2 8.5 6.6 7Z" />
    <path d="M15 12.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6Z" strokeWidth="1.1" />
  </svg>
);
