import { describe, expect, it } from "vitest";
import type { RailCatalog } from "@/lib/railApi.ts";
import type { Ticket } from "./ticket.ts";
import { ticketIssuer } from "./ticketText.ts";

const catalog = {
  operators: [
    { id: "s", serverId: "survival", code: "SURC", name: "生存中部铁路" },
    {
      id: "p",
      serverId: "survival",
      code: "PUAT",
      name: "蒲塘桥都会区交通",
      shortName: "都会交通",
    },
  ],
} as unknown as RailCatalog;
const ticket = (lineCodes: string[]): Ticket => ({
  id: "T",
  from: { serverId: "survival", operatorCode: "SURC", stationCode: "PTK" },
  to: { serverId: "survival", operatorCode: "PUAT", stationCode: "PYU" },
  lineCodes,
  issuedAt: 0,
  validUntil: 1,
});

describe("ticketIssuer", () => {
  it("坐的线路跨两家：两家都写（有简称用简称），是联运票", () => {
    expect(ticketIssuer(catalog, ticket(["SURC:MT", "PUAT:SM"]))).toEqual({
      name: "生存中部铁路 · 都会交通",
      through: true,
    });
  });

  it("只坐一家的线路：只写那一家", () => {
    expect(ticketIssuer(catalog, ticket(["PUAT:SM"]))).toEqual({
      name: "都会交通",
      through: false,
    });
  });

  it("旧版本的票只有线路码：按起点站所属的运营方；还没有线路目录时写 TrainLink", () => {
    expect(ticketIssuer(catalog, ticket(["MT", "WS"])).name).toBe("生存中部铁路");
    expect(ticketIssuer(undefined, ticket(["SURC:MT"])).name).toBe("TrainLink");
  });
});
