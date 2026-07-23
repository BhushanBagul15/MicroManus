export default function ChatIndexPage() {
  return (
    <div className="flex-1 flex items-center justify-center text-center px-6">
      <div className="max-w-sm space-y-2">
        <h2 className="text-lg font-semibold">No chat selected</h2>
        <p className="text-sm text-muted-foreground">
          Pick a thread from the sidebar, or hit &ldquo;+ New Chat&rdquo; to start a research task.
        </p>
      </div>
    </div>
  );
}
