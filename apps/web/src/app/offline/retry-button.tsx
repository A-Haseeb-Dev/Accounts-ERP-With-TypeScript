'use client';

export function RetryButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="mt-6 rounded-lg bg-gradient-to-br from-teal-600 to-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:to-teal-700"
    >
      Try again
    </button>
  );
}
