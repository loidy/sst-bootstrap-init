export class UserCancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "UserCancelledError";
  }
}
