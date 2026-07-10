import { Agent, type ClientRequestArgs } from "node:http";
import { PassThrough, type Duplex } from "node:stream";
import { Client, type ConnectConfig } from "ssh2";

/** HTTP agent that reaches Docker through `docker system dial-stdio` over SSH. */
export class DockerSshAgent extends Agent {
  constructor(private readonly connectConfig: ConnectConfig) {
    super();
  }

  override createConnection(
    _options: ClientRequestArgs,
    callback?: (error: Error | null, stream: Duplex) => void
  ): Duplex | null | undefined {
    if (!callback) {
      throw new Error("Docker SSH transport requires a connection callback");
    }

    const client = new Client();
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      client.end();
      const failedStream = new PassThrough();
      failedStream.destroy();
      callback(error, failedStream);
    };

    client.once("ready", () => {
      client.exec("docker system dial-stdio", (error, stream) => {
        if (error) {
          fail(error);
          return;
        }
        settled = true;
        stream.once("close", () => client.end());
        callback(null, stream);
      });
    });
    client.once("error", fail);
    client.once("close", () => {
      fail(new Error("SSH connection closed before Docker transport opened"));
    });
    try {
      client.connect(this.connectConfig);
    } catch (error) {
      fail(
        error instanceof Error
          ? error
          : new Error("Failed to initialize Docker SSH transport")
      );
    }

    return undefined;
  }
}
