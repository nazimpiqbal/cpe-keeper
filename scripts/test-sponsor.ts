// Sponsor IDs: NASBA ID required unless the sponsor isn't on the Registry.
import assert from "assert";
import { cleanSponsorId, sponsorOk, validSponsorId } from "../src/lib/sponsor";

assert.equal(cleanSponsorId("NASBA Sponsor # 107294"), "107294");
assert.equal(cleanSponsorId(" Sponsor ID: 137501 "), "137501");
assert.ok(validSponsorId("107294"));
assert.ok(validSponsorId("TEST-0001"));
assert.ok(!validSponsorId(""));
assert.ok(!validSponsorId(null));
assert.ok(!validSponsorId("12"));
assert.ok(sponsorOk({ sponsor_id: "107294" }));
assert.ok(!sponsorOk({ sponsor_id: null }));
assert.ok(sponsorOk({ sponsor_id: null, not_on_registry: true }));
console.log("sponsor tests passed");
