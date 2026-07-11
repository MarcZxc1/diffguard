import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "bun:test";
import {
  createGithubAppJwt,
  createGithubInstallationToken,
  GithubAppError,
  type GithubFetch,
} from "./github-app";

const keyPair = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

describe("createGithubAppJwt", () => {
  it("creates a short-lived RS256 token with GitHub App claims", () => {
    const token = createGithubAppJwt({
      appId: "12345",
      privateKey: keyPair.privateKey,
      nowSeconds: 1_700_000_000,
    });
    const claims = jwt.decode(token) as jwt.JwtPayload;

    expect(
      jwt.verify(token, keyPair.publicKey, {
        algorithms: ["RS256"],
        ignoreExpiration: true,
      }),
    ).toBeTruthy();
    expect(claims.iss).toBe("12345");
    expect(claims.iat).toBe(1_699_999_940);
    expect(claims.exp).toBe(1_700_000_540);
  });

  it("rejects a malformed App ID", () => {
    expect(() =>
      createGithubAppJwt({
        appId: "not-a-number",
        privateKey: keyPair.privateKey,
      }),
    ).toThrow("GITHUB_APP_ID must be a numeric GitHub App ID");
  });
});

describe("createGithubInstallationToken", () => {
  it("exchanges the App JWT and validates GitHub's token response", async () => {
    let request: Request | undefined;
    const fetchImpl: GithubFetch = async (input, init) => {
      request = new Request(input.toString(), init);
      return new Response(
        JSON.stringify({
          token: "mock-installation-token",
          expires_at: "2026-07-11T01:00:00Z",
          permissions: { contents: "read" },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    };

    const result = await createGithubInstallationToken({
      installationId: 67890,
      appId: "12345",
      privateKey: keyPair.privateKey,
      fetchImpl,
    });

    expect(result.token).toBe("mock-installation-token");
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe(
      "https://api.github.com/app/installations/67890/access_tokens",
    );
    expect(request?.headers.get("x-github-api-version")).toBe("2022-11-28");
    expect(request?.headers.get("authorization")).toStartWith("Bearer ");
  });

  it("rejects invalid installation IDs before making a request", async () => {
    await expect(
      createGithubInstallationToken({
        installationId: 0,
        appId: "12345",
        privateKey: keyPair.privateKey,
        fetchImpl: async () => new Response(),
      }),
    ).rejects.toBeInstanceOf(GithubAppError);
  });

  it("does not accept malformed or failed GitHub responses", async () => {
    const failedFetch = async () => new Response("unavailable", { status: 503 });
    const malformedFetch = async () =>
      new Response(JSON.stringify({ token: "" }), { status: 201 });

    await expect(
      createGithubInstallationToken({
        installationId: 1,
        appId: "12345",
        privateKey: keyPair.privateKey,
        fetchImpl: failedFetch,
      }),
    ).rejects.toThrow("(503)");

    await expect(
      createGithubInstallationToken({
        installationId: 1,
        appId: "12345",
        privateKey: keyPair.privateKey,
        fetchImpl: malformedFetch,
      }),
    ).rejects.toThrow("invalid installation token response");
  });
});
