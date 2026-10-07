export class StudioError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StudioError";
    this.status = status;
  }
}

export function toErrorResponse(error: unknown) {
  if (error instanceof StudioError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error(error);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}
