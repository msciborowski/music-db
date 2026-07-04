import { describe, expect, it } from "vitest";
import { FpcalcError, parseFpcalcOutput } from "./fpcalc.js";

describe("parseFpcalcOutput", () => {
  it("parses -json output", () => {
    const out = JSON.stringify({ duration: 254.32, fingerprint: "AQADtEmi..." });
    expect(parseFpcalcOutput(out)).toEqual({ fingerprint: "AQADtEmi...", duration: 254.32 });
  });

  it("parses duration given as string", () => {
    const out = '{"duration":"180","fingerprint":"ABC"}';
    expect(parseFpcalcOutput(out)).toEqual({ fingerprint: "ABC", duration: 180 });
  });

  it("parses plain KEY=VALUE output", () => {
    const out = "DURATION=254\nFINGERPRINT=AQADtEmi...\n";
    expect(parseFpcalcOutput(out)).toEqual({ fingerprint: "AQADtEmi...", duration: 254 });
  });

  it("throws on unparseable / incomplete output", () => {
    expect(() => parseFpcalcOutput("garbage")).toThrow(FpcalcError);
    expect(() => parseFpcalcOutput('{"duration":10}')).toThrow(FpcalcError);
  });
});
