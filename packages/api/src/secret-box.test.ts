import { describe, expect, it } from "vitest";
import { SecretBox } from "./secret-box.js";

const secret = Buffer.alloc(32, 7).toString("base64");

describe("SecretBox", () => {
  it("round-trips and never repeats ciphertext", async () => {
    const box = await SecretBox.fromSecret(secret);
    const a = await box.seal("sk-ant-very-secret");
    const b = await box.seal("sk-ant-very-secret");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(await box.open(a)).toBe("sk-ant-very-secret");
    expect(await box.open(b)).toBe("sk-ant-very-secret");
  });

  it("rejects tampering and wrong keys", async () => {
    const box = await SecretBox.fromSecret(secret);
    const sealed = await box.seal("hello");
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("AA") ? "BB" : "AA");
    await expect(box.open(tampered)).rejects.toThrow(/could not be opened/);
    const other = await SecretBox.fromSecret(Buffer.alloc(32, 9).toString("base64"));
    await expect(other.open(sealed)).rejects.toThrow(/could not be opened/);
    await expect(box.open("garbage")).rejects.toThrow(/Unrecognised/);
  });

  it("accepts base64url secrets and rejects wrong lengths", async () => {
    await expect(SecretBox.fromSecret(Buffer.alloc(32, 1).toString("base64url"))).resolves.toBeInstanceOf(SecretBox);
    await expect(SecretBox.fromSecret("c2hvcnQ=")).rejects.toThrow(/32 bytes/);
  });
});
