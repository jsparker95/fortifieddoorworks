"use client";
export default function ErrorPage({
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <main className="error-screen">
      <h1>The workspace could not load.</h1>
      <p>Your saved projects are still in the database.</p>
      <button className="button" onClick={retry}>
        Try again
      </button>
    </main>
  );
}
