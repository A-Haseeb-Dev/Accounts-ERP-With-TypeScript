export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-600/20 text-3xl">
        📡
      </div>
      <h1 className="mb-2 text-xl font-semibold text-white">You are offline</h1>
      <p className="max-w-sm text-sm text-slate-400">
        No internet connection. Pages you have already visited remain available. Reconnect to continue working.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-6 rounded-lg bg-gradient-to-br from-teal-600 to-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:to-teal-700"
      >
        Try again
      </button>
    </div>
  );
}
