import type { Rules } from "../engine/engine";
import ca from "./CA.json";
import ny from "./NY.json";
import tx from "./TX.json";
import fl from "./FL.json";
import il from "./IL.json";
import idr from "./ID.json";
import ct from "./CT.json";
import wa from "./WA.json";
import az from "./AZ.json";
import nj from "./NJ.json";
import pa from "./PA.json";
import oh from "./OH.json";
import mi from "./MI.json";
import ga from "./GA.json";
import ma from "./MA.json";

// States with verified rule files. Add a state by adding its JSON here.
export const RULES: { [state: string]: Rules } = {
  CA: ca as unknown as Rules,
  NY: ny as unknown as Rules,
  TX: tx as unknown as Rules,
  FL: fl as unknown as Rules,
  IL: il as unknown as Rules,
  ID: idr as unknown as Rules,
  CT: ct as unknown as Rules,
  WA: wa as unknown as Rules,
  AZ: az as unknown as Rules,
  NJ: nj as unknown as Rules,
  PA: pa as unknown as Rules,
  OH: oh as unknown as Rules,
  MI: mi as unknown as Rules,
  GA: ga as unknown as Rules,
  MA: ma as unknown as Rules,
};

export const STATE_NAMES: { [state: string]: string } = {
  CA: "California", NY: "New York", TX: "Texas", FL: "Florida", IL: "Illinois",
  PA: "Pennsylvania", OH: "Ohio", NJ: "New Jersey", MI: "Michigan", GA: "Georgia", ID: "Idaho", CT: "Connecticut", WA: "Washington", AZ: "Arizona", MA: "Massachusetts",
};

export const LAUNCH_STATES = ["CA", "NY", "TX", "FL", "IL", "ID", "CT", "WA", "AZ", "PA", "OH", "NJ", "MI", "GA", "MA"];
