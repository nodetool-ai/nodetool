/**
 * `nodetool auth claude` — sign in with a Claude subscription for the Claude
 * Agent provider.
 *
 * Runs the same OAuth flow the `claude` CLI does and writes the tokens to the
 * Claude Agent SDK's credential file (`~/.claude/.credentials.json`), so a
 * NodeTool login and a `claude login` are interchangeable. No database, no
 * server — the SDK reads that file directly.
 */

import { createInterface } from "node:readline";
import type { Command } from "commander";
import {
  ClaudeCodeLogin,
  DefaultBrowserLauncher
} from "@nodetool-ai/runtime/oauth";

import { asJson, printKv } from "./output.js";

function fail(e: unknown): never {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}

/** Read one line from stdin, prompting on stderr so `--json` stays pipeable. */
async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await new Promise<string>((resolve) => {
      process.stderr.write(question);
      rl.question("", resolve);
    });
  } finally {
    rl.close();
  }
}

function describeExpiry(expiresAt: number | null): string {
  if (expiresAt == null) return "never";
  return new Date(expiresAt).toISOString();
}

export function registerAuthCommands(program: Command): void {
  const auth = program
    .command("auth")
    .description(
      "Sign in to providers that use an account instead of an API key"
    );

  const claude = auth
    .command("claude")
    .description("Claude subscription login for the Claude Agent provider");

  claude
    .command("login")
    .description("Sign in with a Claude subscription and store the credentials")
    .option("--console", "Sign in with a Console (API-billed) account")
    .option(
      "--manual",
      "Skip the loopback listener and paste the code shown in the browser"
    )
    .option("--no-browser", "Print the URL instead of opening a browser")
    .option("--json", "Output as JSON")
    .action(
      async (opts: {
        console?: boolean;
        manual?: boolean;
        browser?: boolean;
        json?: boolean;
      }) => {
        const login = new ClaudeCodeLogin();
        try {
          const pending = await login.begin({
            loginMethod: opts.console ? "console" : "claude-ai",
            manualOnly: opts.manual
          });
          const url = pending.authUrl ?? pending.manualAuthUrl;

          if (opts.browser !== false) {
            await new DefaultBrowserLauncher().open(url).catch(() => {
              // No browser on this host — the printed URL is the fallback.
            });
          }
          process.stderr.write(`\nOpen this URL to sign in:\n\n  ${url}\n\n`);

          let credentials;
          if (pending.authUrl) {
            process.stderr.write(
              "Waiting for the browser to redirect back (Ctrl-C to cancel)...\n"
            );
            credentials = await pending.waitForRedirect();
          } else {
            const code = await prompt("Paste the code shown in the browser > ");
            credentials = await pending.completeWithPastedCode(code);
          }

          const summary = {
            connected: true,
            subscription_type: credentials.subscriptionType,
            scopes: credentials.scopes.join(" "),
            expires_at: describeExpiry(credentials.expiresAt),
            credentials_path: login.credentialsPath
          };
          if (opts.json) {
            asJson(summary);
            return;
          }
          console.log("\nSigned in to Claude.");
          printKv(summary);
        } catch (e) {
          fail(e);
        }
      }
    );

  claude
    .command("status")
    .description("Show whether Claude subscription credentials are stored")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const status = await new ClaudeCodeLogin().status();
        const summary = {
          connected: status.connected,
          expired: status.expired,
          subscription_type: status.subscriptionType,
          rate_limit_tier: status.rateLimitTier,
          scopes: status.scopes.join(" "),
          expires_at: describeExpiry(status.expiresAt),
          credentials_path: status.credentialsPath
        };
        if (opts.json) {
          asJson(summary);
          return;
        }
        if (!status.connected) {
          console.log(
            `Not signed in. Run 'nodetool auth claude login'. (${status.credentialsPath})`
          );
          return;
        }
        printKv(summary);
      } catch (e) {
        fail(e);
      }
    });

  claude
    .command("refresh")
    .description("Refresh the stored access token")
    .option("--force", "Refresh even when the current token is still valid")
    .option("--json", "Output as JSON")
    .action(async (opts: { force?: boolean; json?: boolean }) => {
      try {
        const credentials = await new ClaudeCodeLogin().refresh({
          force: opts.force
        });
        const summary = { expires_at: describeExpiry(credentials.expiresAt) };
        if (opts.json) {
          asJson(summary);
          return;
        }
        printKv(summary);
      } catch (e) {
        fail(e);
      }
    });

  claude
    .command("logout")
    .description("Remove the stored Claude subscription credentials")
    .action(async () => {
      try {
        const removed = await new ClaudeCodeLogin().logout();
        console.log(
          removed ? "Signed out of Claude." : "No stored Claude credentials."
        );
      } catch (e) {
        fail(e);
      }
    });
}
