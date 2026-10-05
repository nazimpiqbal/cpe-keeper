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
import va from "./VA.json";
import nc from "./NC.json";
import md from "./MD.json";
import mn from "./MN.json";
import co from "./CO.json";
import mo from "./MO.json";
import wi from "./WI.json";
import tn from "./TN.json";
import inr from "./IN.json";
import la from "./LA.json";

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
  VA: va as unknown as Rules,
  NC: nc as unknown as Rules,
  MD: md as unknown as Rules,
  MN: mn as unknown as Rules,
  CO: co as unknown as Rules,
  MO: mo as unknown as Rules,
  WI: wi as unknown as Rules,
  TN: tn as unknown as Rules,
  IN: inr as unknown as Rules,
  LA: la as unknown as Rules,
};

export const STATE_NAMES: { [state: string]: string } = {
  CA: "California", NY: "New York", TX: "Texas", FL: "Florida", IL: "Illinois",
  PA: "Pennsylvania", OH: "Ohio", NJ: "New Jersey", MI: "Michigan", GA: "Georgia", ID: "Idaho", CT: "Connecticut", WA: "Washington", AZ: "Arizona", MA: "Massachusetts", VA: "Virginia", NC: "North Carolina", MD: "Maryland", MN: "Minnesota", CO: "Colorado", MO: "Missouri", WI: "Wisconsin", TN: "Tennessee", IN: "Indiana", LA: "Louisiana",
};

export const LAUNCH_STATES = ["CA", "NY", "TX", "FL", "IL", "ID", "CT", "WA", "AZ", "PA", "OH", "NJ", "MI", "GA", "MA", "VA", "NC", "MD", "MN", "CO", "MO", "WI", "TN", "IN", "LA"];
