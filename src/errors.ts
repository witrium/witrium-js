export class WitriumClientException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WitriumClientException";
  }
}
