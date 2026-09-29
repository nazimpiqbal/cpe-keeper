// Row types and conversion, kept free of React Native imports so tests can use them.
import { Record as CpeRecord } from "../engine/engine";
import { normalizeDelivery } from "./delivery";

export type License = {
  id: string;
  state: string;
  expiration_date: string;
  license_issued: string | null;
  regulatory_review_due: string | null;
  practice: string[];
  first_renewal?: boolean;
};

export type CpeRow = {
  id: string;
  title: string;
  provider: string | null;
  completed_on: string;
  hours: number;
  field_of_study: string | null;
  delivery_method: string | null;
  needs_review: boolean;
  created_at: string;
  sponsor_id?: string | null;
  certificate_path?: string | null;
};

export const toEngineRecord = (r: CpeRow): CpeRecord => ({
  title: r.title,
  provider: r.provider ?? "",
  date: r.completed_on,
  hours: Number(r.hours),
  fieldOfStudy: r.field_of_study ?? "",
  delivery: normalizeDelivery(r.delivery_method) ?? undefined,
  needsReview: r.needs_review,
});
