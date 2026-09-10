export class CreativeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreativeError";
  }
}