export class AppRunError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "conflict"
      | "invalid_input"
      | "budget_exceeded",
    message: string
  ) {
    super(message);
    this.name = "AppRunError";
  }
}
export class AppInstanceConflictError extends AppRunError {
  constructor() {
    super(
      "conflict",
      "App instance revision changed. Reload before writing state."
    );
    this.name = "AppInstanceConflictError";
  }
}
