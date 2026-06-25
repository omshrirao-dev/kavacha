export function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="mb-4 rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{message}</p>
  )
}
