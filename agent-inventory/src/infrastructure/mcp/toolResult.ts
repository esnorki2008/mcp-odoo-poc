/** Keep text for older clients and structured data for agents that support it. */
export function toolResult(data: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

export function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected tool failure';
  return { ...toolResult({ error: { message } }), isError: true as const };
}
