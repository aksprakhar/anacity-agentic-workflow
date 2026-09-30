import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-50 px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-gray-500">ANACITY</p>

        <h1 className="mt-2 text-4xl font-semibold text-gray-900">
          Move-in / Move-out Workflow
        </h1>

        <p className="mt-3 text-gray-600">
          Resident and community administration workflow.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <Link
            href="/resident"
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gray-300"
          >
            <h2 className="text-xl font-semibold text-gray-900">
              Resident experience
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-600">
              Create and track move-in or move-out requests.
            </p>
          </Link>

          <Link
            href="/admin"
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gray-300"
          >
            <h2 className="text-xl font-semibold text-gray-900">
              Admin experience
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-600">
              Review resident requests and take action.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
