import type { Rules } from "../engine/engine";
import ca from "./CA.json";
import ny from "./NY.json";
import tx from "./TX.json";
import fl from "./FL.json";

// States with verified rule files. Add a state by adding its JSON here.
export const RULES: { [state: string]: Rules } = {
  CA: ca as unknown as Rules,
  NY: ny as unknown as Rules,
  TX: tx as unknown as Rules,
  FL: fl as unknown as Rules,
};

export const STATE_NAMES: { [state: string]: string } = {
  CA: "California", NY: "New York", TX: "Texas", FL: "Florida", IL: "Illinois",
  PA: "Pennsylvania", OH: "Ohio", NJ: "New Jersey", MI: "Michigan", GA: "Georgia",
};

export const LAUNCH_STATES = ["CA", "NY", "TX", "FL", "IL", "PA", "OH", "NJ", "MI", "GA"];
