"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Setup problems (database, migrations, seed) surface here during development.
    console.error(error);
  }, [error]);

  return (
    <main className="page max-w-2xl">
      <h1 className="text-2xl font-semibold">Unable to load this page</h1>
      <p className="my-4">
        Something went wrong on our side. Please try again in a moment.
      </p>
      <button className="button" onClick={retry}>
        Try again
      </button>
    </main>
  );
}
